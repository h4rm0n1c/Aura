import {
  isHumanRole,
  type HumanPrincipal,
  type HumanRole,
  type HumanStatus,
} from "../../../../packages/core/src/auth/principals.ts";
import {
  authorizeBoardLifecycle,
  authorizeBoardSettings,
  authorizeBoardStaffChange,
  isBoardStaffRole,
  type BoardStaffRole,
} from "../../../../packages/core/src/domain/authorization.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { createAuraId, isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { resultChanges, type D1DatabaseLike } from "../db/d1.ts";

export type BoardStatus = "active" | "archived";

export interface BoardAdminSummary {
  readonly boardId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly status: BoardStatus;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly staffCount: number;
  readonly moderatorCount: number;
  readonly managerCount: number;
}

export interface BoardManagementSummary extends BoardAdminSummary {
  readonly actorBoardRole: BoardStaffRole | null;
}

export interface BoardStaffCandidate {
  readonly humanId: string;
  readonly displayName: string | null;
  readonly siteRole: HumanRole;
  readonly status: HumanStatus;
  readonly boardRole: BoardStaffRole | null;
}

export interface BoardStaffPageData {
  readonly board: BoardManagementSummary;
  readonly people: readonly BoardStaffCandidate[];
}

export type BoardAdminResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface BoardRow {
  readonly id: unknown;
  readonly slug: unknown;
  readonly title: unknown;
  readonly description: unknown;
  readonly status: unknown;
  readonly sort_order: unknown;
  readonly created_at: unknown;
  readonly staff_count?: unknown;
  readonly moderator_count?: unknown;
  readonly manager_count?: unknown;
  readonly actor_board_role?: unknown;
}

interface StaffCandidateRow {
  readonly id: unknown;
  readonly display_name: unknown;
  readonly role: unknown;
  readonly status: unknown;
  readonly board_role: unknown;
}

interface StaffStateRow {
  readonly status: unknown;
  readonly board_role: unknown;
}

const BOARD_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function listBoardsForAdmin(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
): Promise<BoardAdminResult<readonly BoardAdminSummary[]>> {
  const authorized = authorizeBoardLifecycle(principal);
  if (!authorized.ok) return authorized;

  let rows: readonly BoardRow[];
  try {
    const result = await db.prepare(`
      SELECT
        b.id, b.slug, b.title, b.description, b.status, b.sort_order, b.created_at,
        (SELECT COUNT(*) FROM board_staff s WHERE s.board_id = b.id) AS staff_count,
        (SELECT COUNT(*) FROM board_staff s WHERE s.board_id = b.id AND s.role = 'moderator') AS moderator_count,
        (SELECT COUNT(*) FROM board_staff s WHERE s.board_id = b.id AND s.role = 'manager') AS manager_count
      FROM boards b
      ORDER BY b.sort_order ASC, b.slug ASC, b.id ASC
    `).all<BoardRow>();
    rows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const output: BoardAdminSummary[] = [];
  for (const row of rows) {
    const parsed = parseBoard(row, true);
    if (parsed === null) return fail("internal_error");
    output.push(Object.freeze(parsed));
  }
  return { ok: true, value: Object.freeze(output) };
}

export async function createBoard(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  input: { readonly slug: unknown; readonly title: unknown; readonly description: unknown },
  nowSeconds: number,
): Promise<BoardAdminResult<{ readonly boardId: string; readonly slug: string }>> {
  const authorized = authorizeBoardLifecycle(principal);
  if (!authorized.ok) return authorized;

  const slug = normalizeSlug(input.slug);
  const title = normalizeTitle(input.title);
  const description = normalizeDescription(input.description);
  if (slug === null || title === null || description === null || !validTimestamp(nowSeconds)) {
    return fail("validation_error");
  }

  const boardId = createAuraId("board");
  try {
    const results = await db.batch([
      db.prepare(`
        INSERT INTO boards (id, slug, title, description, status, sort_order, created_at)
        SELECT ?1, ?2, ?3, ?4, 'active', COALESCE(MAX(sort_order), -10) + 10, ?5
        FROM boards
      `).bind(boardId, slug, title, description, nowSeconds),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        VALUES (?1, 'human', ?2, 'board_created', 'board', ?3, json_object('slug', ?4))
      `).bind(nowSeconds, principal.humanId, boardId, slug),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("conflict");
  }

  return { ok: true, value: Object.freeze({ boardId, slug }) };
}

export async function getBoardForManagement(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  boardId: string,
): Promise<BoardAdminResult<BoardManagementSummary>> {
  if (!isAuraId("board", boardId)) return fail("validation_error");

  let row: BoardRow | null;
  try {
    row = await db.prepare(`
      SELECT
        b.id, b.slug, b.title, b.description, b.status, b.sort_order, b.created_at,
        (SELECT COUNT(*) FROM board_staff s WHERE s.board_id = b.id) AS staff_count,
        (SELECT COUNT(*) FROM board_staff s WHERE s.board_id = b.id AND s.role = 'moderator') AS moderator_count,
        (SELECT COUNT(*) FROM board_staff s WHERE s.board_id = b.id AND s.role = 'manager') AS manager_count,
        (SELECT s.role FROM board_staff s WHERE s.board_id = b.id AND s.human_id = ?2 LIMIT 1) AS actor_board_role
      FROM boards b
      WHERE b.id = ?1
      LIMIT 1
    `).bind(boardId, principal.humanId).first<BoardRow>();
  } catch {
    return fail("internal_error");
  }
  if (row === null) return fail("not_found");

  const parsed = parseManagementBoard(row);
  if (parsed === null) return fail("internal_error");
  const authorized = authorizeBoardSettings(principal, parsed.actorBoardRole);
  if (!authorized.ok) return authorized;
  return { ok: true, value: Object.freeze(parsed) };
}

export async function updateBoardMetadata(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  boardId: string,
  input: { readonly title: unknown; readonly description: unknown },
  nowSeconds: number,
): Promise<BoardAdminResult<{ readonly boardId: string }>> {
  if (!validTimestamp(nowSeconds)) return fail("validation_error");
  const managed = await getBoardForManagement(db, principal, boardId);
  if (!managed.ok) return managed;

  const title = normalizeTitle(input.title);
  const description = normalizeDescription(input.description);
  if (title === null || description === null) return fail("validation_error");
  const board = managed.value;
  if (title === board.title && description === board.description) {
    return { ok: true, value: Object.freeze({ boardId }) };
  }

  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE boards
        SET title = ?1, description = ?2
        WHERE id = ?3 AND title = ?4 AND description = ?5
      `).bind(title, description, boardId, board.title, board.description),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'board_metadata_changed', 'board', id,
               json_object('title_changed', ?6, 'description_changed', ?7)
        FROM boards
        WHERE id = ?3 AND title = ?4 AND description = ?5
      `).bind(
        nowSeconds,
        principal.humanId,
        boardId,
        title,
        description,
        title === board.title ? 0 : 1,
        description === board.description ? 0 : 1,
      ),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("internal_error");
  }

  return { ok: true, value: Object.freeze({ boardId }) };
}

export async function setBoardStatus(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  boardId: string,
  nextStatus: unknown,
  nowSeconds: number,
): Promise<BoardAdminResult<{ readonly boardId: string; readonly status: BoardStatus }>> {
  const authorized = authorizeBoardLifecycle(principal);
  if (!authorized.ok) return authorized;
  if (
    !isAuraId("board", boardId) ||
    (nextStatus !== "active" && nextStatus !== "archived") ||
    !validTimestamp(nowSeconds)
  ) {
    return fail("validation_error");
  }

  const board = await loadBoard(db, boardId);
  if (board === null) return fail("not_found");
  if (board.status === nextStatus) {
    return { ok: true, value: Object.freeze({ boardId, status: nextStatus }) };
  }

  try {
    const results = await db.batch([
      db.prepare("UPDATE boards SET status = ?1 WHERE id = ?2 AND status = ?3")
        .bind(nextStatus, boardId, board.status),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'board_status_changed', 'board', id,
               json_object('from', ?4, 'to', ?5)
        FROM boards
        WHERE id = ?3 AND status = ?5
      `).bind(nowSeconds, principal.humanId, boardId, board.status, nextStatus),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("internal_error");
  }

  return { ok: true, value: Object.freeze({ boardId, status: nextStatus }) };
}

export async function setBoardSortOrder(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  boardId: string,
  nextSortOrder: unknown,
  nowSeconds: number,
): Promise<BoardAdminResult<{ readonly boardId: string; readonly sortOrder: number }>> {
  const authorized = authorizeBoardLifecycle(principal);
  if (!authorized.ok) return authorized;
  if (!isAuraId("board", boardId) || !validSortOrder(nextSortOrder) || !validTimestamp(nowSeconds)) {
    return fail("validation_error");
  }

  const board = await loadBoard(db, boardId);
  if (board === null) return fail("not_found");
  if (board.sortOrder === nextSortOrder) {
    return { ok: true, value: Object.freeze({ boardId, sortOrder: nextSortOrder }) };
  }

  try {
    const results = await db.batch([
      db.prepare("UPDATE boards SET sort_order = ?1 WHERE id = ?2 AND sort_order = ?3")
        .bind(nextSortOrder, boardId, board.sortOrder),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'board_sort_order_changed', 'board', id,
               json_object('from', ?4, 'to', ?5)
        FROM boards
        WHERE id = ?3 AND sort_order = ?5
      `).bind(nowSeconds, principal.humanId, boardId, board.sortOrder, nextSortOrder),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("internal_error");
  }

  return { ok: true, value: Object.freeze({ boardId, sortOrder: nextSortOrder }) };
}

export async function getBoardStaffPageData(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  boardId: string,
): Promise<BoardAdminResult<BoardStaffPageData>> {
  const managed = await getBoardForManagement(db, principal, boardId);
  if (!managed.ok) return managed;

  let rows: readonly StaffCandidateRow[];
  try {
    const result = await db.prepare(`
      SELECT h.id, COALESCE(h.display_name, h.email) AS display_name, h.role, h.status, s.role AS board_role
      FROM humans h
      LEFT JOIN board_staff s ON s.board_id = ?1 AND s.human_id = h.id
      WHERE h.status = 'active' OR s.role IS NOT NULL
      ORDER BY CASE WHEN s.role = 'manager' THEN 0 WHEN s.role = 'moderator' THEN 1 ELSE 2 END,
               COALESCE(h.display_name, h.email, h.id) COLLATE NOCASE,
               h.id
    `).bind(boardId).all<StaffCandidateRow>();
    rows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const people: BoardStaffCandidate[] = [];
  for (const row of rows) {
    const parsed = parseStaffCandidate(row);
    if (parsed === null) return fail("internal_error");
    people.push(Object.freeze(parsed));
  }
  return {
    ok: true,
    value: Object.freeze({ board: managed.value, people: Object.freeze(people) }),
  };
}

export async function setBoardStaffRole(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  boardId: string,
  targetHumanId: string,
  nextRoleInput: unknown,
  nowSeconds: number,
): Promise<BoardAdminResult<{ readonly boardId: string; readonly humanId: string; readonly role: BoardStaffRole | null }>> {
  if (
    !isAuraId("board", boardId) ||
    !isAuraId("human", targetHumanId) ||
    !validTimestamp(nowSeconds)
  ) {
    return fail("validation_error");
  }
  const nextRole = nextRoleInput === null ? null : isBoardStaffRole(nextRoleInput) ? nextRoleInput : undefined;
  if (nextRole === undefined) return fail("validation_error");

  const board = await loadBoard(db, boardId);
  if (board === null) return fail("not_found");
  const actorBoardRole = await loadBoardStaffRole(db, boardId, principal.humanId);
  const target = await loadStaffState(db, boardId, targetHumanId);
  if (target === null) return fail("not_found");

  const authorized = authorizeBoardStaffChange(principal, actorBoardRole, target.boardRole, nextRole);
  if (!authorized.ok) return authorized;
  if (nextRole !== null && target.status !== "active") return fail("conflict");
  if (target.boardRole === nextRole) {
    return { ok: true, value: Object.freeze({ boardId, humanId: targetHumanId, role: nextRole }) };
  }

  let mutation;
  if (target.boardRole === null && nextRole !== null) {
    mutation = db.prepare(`
      INSERT INTO board_staff (board_id, human_id, role, granted_by_human_id, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
    `).bind(boardId, targetHumanId, nextRole, principal.humanId, nowSeconds);
  } else if (target.boardRole !== null && nextRole === null) {
    mutation = db.prepare("DELETE FROM board_staff WHERE board_id = ?1 AND human_id = ?2 AND role = ?3")
      .bind(boardId, targetHumanId, target.boardRole);
  } else {
    mutation = db.prepare(`
      UPDATE board_staff
      SET role = ?1, granted_by_human_id = ?2, created_at = ?3
      WHERE board_id = ?4 AND human_id = ?5 AND role = ?6
    `).bind(nextRole, principal.humanId, nowSeconds, boardId, targetHumanId, target.boardRole);
  }

  try {
    const targetId = `${boardId}:${targetHumanId}`;
    const results = await db.batch([
      mutation,
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        VALUES (?1, 'human', ?2, 'board_staff_changed', 'board_staff', ?3,
                json_object('board_id', ?4, 'human_id', ?5, 'from', ?6, 'to', ?7))
      `).bind(nowSeconds, principal.humanId, targetId, boardId, targetHumanId, target.boardRole, nextRole),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("conflict");
  }

  return { ok: true, value: Object.freeze({ boardId, humanId: targetHumanId, role: nextRole }) };
}

async function loadBoard(db: D1DatabaseLike, boardId: string): Promise<BoardAdminSummary | null> {
  let row: BoardRow | null;
  try {
    row = await db.prepare(`
      SELECT id, slug, title, description, status, sort_order, created_at,
             0 AS staff_count, 0 AS moderator_count, 0 AS manager_count
      FROM boards
      WHERE id = ?1
      LIMIT 1
    `).bind(boardId).first<BoardRow>();
  } catch {
    return null;
  }
  return row === null ? null : parseBoard(row, true);
}

async function loadBoardStaffRole(
  db: D1DatabaseLike,
  boardId: string,
  humanId: string,
): Promise<BoardStaffRole | null> {
  let row: { readonly role: unknown } | null;
  try {
    row = await db.prepare(`
      SELECT role FROM board_staff WHERE board_id = ?1 AND human_id = ?2 LIMIT 1
    `).bind(boardId, humanId).first<{ readonly role: unknown }>();
  } catch {
    return null;
  }
  return row !== null && isBoardStaffRole(row.role) ? row.role : null;
}

async function loadStaffState(
  db: D1DatabaseLike,
  boardId: string,
  humanId: string,
): Promise<{ readonly status: HumanStatus; readonly boardRole: BoardStaffRole | null } | null> {
  let row: StaffStateRow | null;
  try {
    row = await db.prepare(`
      SELECT h.status, s.role AS board_role
      FROM humans h
      LEFT JOIN board_staff s ON s.board_id = ?1 AND s.human_id = h.id
      WHERE h.id = ?2
      LIMIT 1
    `).bind(boardId, humanId).first<StaffStateRow>();
  } catch {
    return null;
  }
  if (
    row === null ||
    (row.status !== "active" && row.status !== "disabled") ||
    !(row.board_role === null || isBoardStaffRole(row.board_role))
  ) {
    return null;
  }
  return { status: row.status, boardRole: row.board_role };
}

function parseBoard(row: BoardRow, requireCounts: boolean): BoardAdminSummary | null {
  if (
    !isAuraId("board", row.id) ||
    typeof row.slug !== "string" || normalizeSlug(row.slug) !== row.slug ||
    typeof row.title !== "string" || normalizeTitle(row.title) !== row.title ||
    typeof row.description !== "string" || row.description.length > 1024 ||
    (row.status !== "active" && row.status !== "archived") ||
    !validSortOrder(row.sort_order) ||
    !validTimestamp(row.created_at)
  ) {
    return null;
  }

  const staffCount = requireCounts ? row.staff_count : 0;
  const moderatorCount = requireCounts ? row.moderator_count : 0;
  const managerCount = requireCounts ? row.manager_count : 0;
  if (!validCount(staffCount) || !validCount(moderatorCount) || !validCount(managerCount)) return null;
  if (moderatorCount + managerCount !== staffCount) return null;

  return {
    boardId: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    staffCount,
    moderatorCount,
    managerCount,
  };
}

function parseManagementBoard(row: BoardRow): BoardManagementSummary | null {
  const base = parseBoard(row, true);
  if (base === null) return null;
  if (!(row.actor_board_role === null || isBoardStaffRole(row.actor_board_role))) return null;
  return { ...base, actorBoardRole: row.actor_board_role };
}

function parseStaffCandidate(row: StaffCandidateRow): BoardStaffCandidate | null {
  if (
    !isAuraId("human", row.id) ||
    !(row.display_name === null || (typeof row.display_name === "string" && row.display_name.length <= 320)) ||
    !isHumanRole(row.role) ||
    (row.status !== "active" && row.status !== "disabled") ||
    !(row.board_role === null || isBoardStaffRole(row.board_role))
  ) {
    return null;
  }
  return {
    humanId: row.id,
    displayName: row.display_name,
    siteRole: row.role,
    status: row.status,
    boardRole: row.board_role,
  };
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value.trim().toLowerCase();
  return slug.length >= 1 && slug.length <= 64 && BOARD_SLUG.test(slug) ? slug : null;
}

function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title.length >= 1 && title.length <= 120 ? title : null;
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const description = value.trim();
  return description.length <= 1024 ? description : null;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validSortOrder(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000;
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "forbidden" | "not_found" | "validation_error" | "conflict" | "internal_error") {
  return { ok: false as const, error: domainError(code) };
}
