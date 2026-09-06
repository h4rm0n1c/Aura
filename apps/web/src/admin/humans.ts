import {
  isHumanRole,
  type HumanPrincipal,
  type HumanRole,
  type HumanStatus,
} from "../../../../packages/core/src/auth/principals.ts";
import { authorizeHumanAdministration } from "../../../../packages/core/src/domain/authorization.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { resultChanges, type D1DatabaseLike } from "../db/d1.ts";

export interface HumanAdminSummary {
  readonly humanId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: HumanRole;
  readonly status: HumanStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastSeenAt: number | null;
  readonly agentCount: number;
  readonly activeAgentCount: number;
}

export type HumanAdminResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface HumanSummaryRow {
  readonly id: unknown;
  readonly email: unknown;
  readonly display_name: unknown;
  readonly role: unknown;
  readonly status: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
  readonly last_seen_at: unknown;
  readonly agent_count: unknown;
  readonly active_agent_count: unknown;
}

interface HumanStateRow {
  readonly role: unknown;
  readonly status: unknown;
}

export async function listHumansForAdmin(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
): Promise<HumanAdminResult<readonly HumanAdminSummary[]>> {
  const authorized = authorizeHumanAdministration(principal);
  if (!authorized.ok) return authorized;

  let rows: readonly HumanSummaryRow[];
  try {
    const result = await db.prepare(`
      SELECT
        h.id,
        h.email,
        h.display_name,
        h.role,
        h.status,
        h.created_at,
        h.updated_at,
        h.last_seen_at,
        COUNT(a.id) AS agent_count,
        COALESCE(SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END), 0) AS active_agent_count
      FROM humans h
      LEFT JOIN agents a ON a.owner_human_id = h.id
      GROUP BY h.id, h.email, h.display_name, h.role, h.status, h.created_at, h.updated_at, h.last_seen_at
      ORDER BY h.created_at ASC, h.id ASC
    `).all<HumanSummaryRow>();
    rows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const output: HumanAdminSummary[] = [];
  for (const row of rows) {
    const parsed = parseSummary(row);
    if (parsed === null) return fail("internal_error");
    output.push(Object.freeze(parsed));
  }
  return { ok: true, value: Object.freeze(output) };
}

export async function setHumanRole(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  targetHumanId: string,
  nextRole: unknown,
  nowSeconds: number,
): Promise<HumanAdminResult<{ readonly humanId: string; readonly role: HumanRole }>> {
  const authorized = authorizeHumanAdministration(principal);
  if (!authorized.ok) return authorized;
  if (!isAuraId("human", targetHumanId) || !isHumanRole(nextRole) || !validTimestamp(nowSeconds)) {
    return fail("validation_error");
  }

  const target = await loadHumanState(db, targetHumanId);
  if (target === null) return fail("not_found");
  if (target.role === nextRole) {
    return { ok: true, value: Object.freeze({ humanId: targetHumanId, role: nextRole }) };
  }

  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE humans
        SET role = ?1, updated_at = ?2
        WHERE id = ?3 AND role = ?4 AND status = ?5
      `).bind(nextRole, nowSeconds, targetHumanId, target.role, target.status),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'human_role_changed', 'human', id,
               json_object('from', ?4, 'to', ?5)
        FROM humans
        WHERE id = ?3 AND role = ?5 AND updated_at = ?1
      `).bind(nowSeconds, principal.humanId, targetHumanId, target.role, nextRole),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    // Includes the database-level last-active-admin invariant.
    return fail("conflict");
  }

  return { ok: true, value: Object.freeze({ humanId: targetHumanId, role: nextRole }) };
}

export async function setHumanStatus(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  targetHumanId: string,
  nextStatus: unknown,
  nowSeconds: number,
): Promise<HumanAdminResult<{ readonly humanId: string; readonly status: HumanStatus }>> {
  const authorized = authorizeHumanAdministration(principal);
  if (!authorized.ok) return authorized;
  if (
    !isAuraId("human", targetHumanId) ||
    (nextStatus !== "active" && nextStatus !== "disabled") ||
    !validTimestamp(nowSeconds)
  ) {
    return fail("validation_error");
  }

  const target = await loadHumanState(db, targetHumanId);
  if (target === null) return fail("not_found");
  if (target.status === nextStatus) {
    return { ok: true, value: Object.freeze({ humanId: targetHumanId, status: nextStatus }) };
  }

  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE humans
        SET status = ?1, updated_at = ?2
        WHERE id = ?3 AND role = ?4 AND status = ?5
      `).bind(nextStatus, nowSeconds, targetHumanId, target.role, target.status),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'human_status_changed', 'human', id,
               json_object('from', ?4, 'to', ?5)
        FROM humans
        WHERE id = ?3 AND status = ?5 AND updated_at = ?1
      `).bind(nowSeconds, principal.humanId, targetHumanId, target.status, nextStatus),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    // Includes the database-level last-active-admin invariant.
    return fail("conflict");
  }

  return { ok: true, value: Object.freeze({ humanId: targetHumanId, status: nextStatus }) };
}

async function loadHumanState(
  db: D1DatabaseLike,
  humanId: string,
): Promise<{ readonly role: HumanRole; readonly status: HumanStatus } | null> {
  let row: HumanStateRow | null;
  try {
    row = await db.prepare(`
      SELECT role, status
      FROM humans
      WHERE id = ?1
      LIMIT 1
    `).bind(humanId).first<HumanStateRow>();
  } catch {
    return null;
  }
  if (
    row === null ||
    !isHumanRole(row.role) ||
    (row.status !== "active" && row.status !== "disabled")
  ) {
    return null;
  }
  return { role: row.role, status: row.status };
}

function parseSummary(row: HumanSummaryRow): HumanAdminSummary | null {
  if (
    !isAuraId("human", row.id) ||
    typeof row.email !== "string" || row.email.length < 3 || row.email.length > 320 ||
    !(row.display_name === null || (typeof row.display_name === "string" && row.display_name.length <= 256)) ||
    !isHumanRole(row.role) ||
    (row.status !== "active" && row.status !== "disabled") ||
    !validTimestamp(row.created_at) ||
    !validTimestamp(row.updated_at) ||
    !(row.last_seen_at === null || validTimestamp(row.last_seen_at)) ||
    !validCount(row.agent_count) ||
    !validCount(row.active_agent_count) ||
    row.active_agent_count > row.agent_count
  ) {
    return null;
  }
  return {
    humanId: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    agentCount: row.agent_count,
    activeAgentCount: row.active_agent_count,
  };
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "forbidden" | "not_found" | "validation_error" | "conflict" | "internal_error") {
  return { ok: false as const, error: domainError(code) };
}
