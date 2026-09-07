import type { HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { extractPostReferenceSequences } from "../../../../packages/core/src/domain/post-references.ts";
import { MCP_LIMITS } from "../../../../packages/core/src/mcp/schemas.ts";
import { resultChanges, type D1DatabaseLike, type D1PreparedStatementLike } from "../db/d1.ts";

export type PostEditResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface EditTargetRow {
  readonly id: unknown;
  readonly body: unknown;
  readonly author_kind: unknown;
  readonly author_human_id: unknown;
  readonly visibility: unknown;
  readonly thread_state: unknown;
  readonly listing_state: unknown;
  readonly board_status: unknown;
  readonly edited_at: unknown;
}

interface EditedAtRow {
  readonly id: unknown;
  readonly edited_at: unknown;
}

interface ReferenceTargetRow {
  readonly id: unknown;
}

interface ExistingReferenceRow {
  readonly target_post_id: unknown;
}

export async function editHumanPost(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  input: { readonly threadId: unknown; readonly postId: unknown; readonly body: unknown },
  nowSeconds: number,
): Promise<PostEditResult<{ readonly threadId: string; readonly postId: string; readonly editedAt: number | null }>> {
  if (
    !isAuraId("thread", input.threadId) ||
    !isAuraId("post", input.postId) ||
    !validPostBody(input.body) ||
    !Number.isSafeInteger(nowSeconds) || nowSeconds < 0
  ) {
    return fail("validation_error");
  }

  let row: EditTargetRow | null;
  try {
    row = await db.prepare(`
      SELECT
        p.id,
        p.body,
        p.author_kind,
        p.author_human_id,
        p.visibility,
        t.state AS thread_state,
        t.listing_state,
        b.status AS board_status,
        p.edited_at
      FROM posts p
      JOIN threads t ON t.id = p.thread_id
      JOIN boards b ON b.id = t.board_id
      WHERE p.id = ?1 AND p.thread_id = ?2
      LIMIT 1
    `).bind(input.postId, input.threadId).first<EditTargetRow>();
  } catch {
    return fail("internal_error");
  }

  if (row === null) return fail("not_found");
  if (
    row.author_kind !== "human" ||
    row.author_human_id !== principal.humanId ||
    row.visibility !== "visible"
  ) {
    return fail("forbidden");
  }
  if (row.board_status !== "active") return fail("not_found");
  if (row.listing_state === "archived") return fail("thread_archived");
  if (row.thread_state === "locked") return fail("thread_locked");
  if (row.listing_state !== "live" || (row.thread_state !== "open" && row.thread_state !== "solved")) {
    return fail("internal_error");
  }
  if (typeof row.body !== "string") return fail("internal_error");
  if (row.edited_at !== null && (!Number.isSafeInteger(row.edited_at) || (row.edited_at as number) < 0)) {
    return fail("internal_error");
  }

  if (row.body === input.body) {
    return {
      ok: true,
      value: Object.freeze({
        threadId: input.threadId,
        postId: input.postId,
        editedAt: row.edited_at as number | null,
      }),
    };
  }

  const targets = await resolveReferenceTargets(db, input.threadId, input.body);
  const existing = await loadExistingReferences(db, input.threadId, input.postId);
  if (targets === null || existing === null) return fail("internal_error");

  const desired = new Set(targets);
  const stale = [...existing].filter((postId) => !desired.has(postId));
  const added = targets.filter((postId) => !existing.has(postId));

  try {
    const statements: D1PreparedStatementLike[] = [
      db.prepare(`
        UPDATE posts
        SET body = ?1, edited_at = ?2, edited_by_human_id = ?3
        WHERE id = ?4
          AND thread_id = ?5
          AND author_kind = 'human'
          AND author_human_id = ?3
          AND visibility = 'visible'
      `).bind(input.body, nowSeconds, principal.humanId, input.postId, input.threadId),
    ];

    const deleteStatement = buildReferenceDelete(db, input.threadId, input.postId, stale);
    if (deleteStatement !== null) statements.push(deleteStatement);
    const insertStatement = buildReferenceInsert(db, input.threadId, input.postId, added, nowSeconds);
    if (insertStatement !== null) statements.push(insertStatement);

    const results = await db.batch(statements);
    if (resultChanges(results[0]) !== 1) return fail("conflict");

    let resultIndex = 1;
    if (stale.length > 0) {
      if (resultChanges(results[resultIndex]) !== stale.length) return fail("conflict");
      resultIndex += 1;
    }
    if (added.length > 0 && resultChanges(results[resultIndex]) !== added.length) return fail("conflict");
  } catch {
    return fail("conflict");
  }

  return {
    ok: true,
    value: Object.freeze({ threadId: input.threadId, postId: input.postId, editedAt: nowSeconds }),
  };
}

export async function loadPostEditedAt(
  db: D1DatabaseLike,
  threadId: string,
): Promise<ReadonlyMap<string, number> | null> {
  if (!isAuraId("thread", threadId)) return null;
  let rows: readonly EditedAtRow[];
  try {
    const result = await db.prepare(`
      SELECT id, edited_at
      FROM posts
      WHERE thread_id = ?1 AND visibility = 'visible' AND edited_at IS NOT NULL
    `).bind(threadId).all<EditedAtRow>();
    rows = result.results ?? [];
  } catch {
    return null;
  }

  const edited = new Map<string, number>();
  for (const row of rows) {
    if (
      typeof row.id !== "string" || !isAuraId("post", row.id) ||
      !Number.isSafeInteger(row.edited_at) || (row.edited_at as number) < 0
    ) {
      return null;
    }
    edited.set(row.id, row.edited_at as number);
  }
  return edited;
}

async function resolveReferenceTargets(
  db: D1DatabaseLike,
  threadId: string,
  body: string,
): Promise<readonly string[] | null> {
  const sequences = extractPostReferenceSequences(body);
  if (sequences.length === 0) return Object.freeze([]);
  if (sequences.length > MCP_LIMITS.postReferences) return null;

  const placeholders = sequences.map((_sequence, index) => `?${index + 2}`).join(", ");
  let rows: readonly ReferenceTargetRow[];
  try {
    const result = await db.prepare(`
      SELECT id
      FROM posts
      WHERE thread_id = ?1
        AND visibility = 'visible'
        AND sequence IN (${placeholders})
      ORDER BY sequence ASC
    `).bind(threadId, ...sequences).all<ReferenceTargetRow>();
    rows = result.results ?? [];
  } catch {
    return null;
  }

  const targets: string[] = [];
  for (const row of rows) {
    if (!isAuraId("post", row.id)) return null;
    targets.push(row.id);
  }
  return Object.freeze(targets);
}

async function loadExistingReferences(
  db: D1DatabaseLike,
  threadId: string,
  sourcePostId: string,
): Promise<ReadonlySet<string> | null> {
  let rows: readonly ExistingReferenceRow[];
  try {
    const result = await db.prepare(`
      SELECT target_post_id
      FROM post_references
      WHERE thread_id = ?1 AND source_post_id = ?2
      ORDER BY target_post_id ASC
    `).bind(threadId, sourcePostId).all<ExistingReferenceRow>();
    rows = result.results ?? [];
  } catch {
    return null;
  }

  const existing = new Set<string>();
  for (const row of rows) {
    if (!isAuraId("post", row.target_post_id)) return null;
    existing.add(row.target_post_id);
  }
  return existing;
}

function buildReferenceDelete(
  db: D1DatabaseLike,
  threadId: string,
  sourcePostId: string,
  targets: readonly string[],
): D1PreparedStatementLike | null {
  if (targets.length === 0) return null;
  const placeholders = targets.map((_target, index) => `?${index + 3}`).join(", ");
  return db.prepare(`
    DELETE FROM post_references
    WHERE thread_id = ?1
      AND source_post_id = ?2
      AND target_post_id IN (${placeholders})
  `).bind(threadId, sourcePostId, ...targets);
}

function buildReferenceInsert(
  db: D1DatabaseLike,
  threadId: string,
  sourcePostId: string,
  targets: readonly string[],
  referencedAt: number,
): D1PreparedStatementLike | null {
  if (targets.length === 0) return null;
  const values: string[] = [];
  const bindings: unknown[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const base = index * 4 + 1;
    values.push(`(?${base}, ?${base + 1}, ?${base + 2}, ?${base + 3})`);
    bindings.push(threadId, sourcePostId, targets[index], referencedAt);
  }
  return db.prepare(`
    INSERT INTO post_references (thread_id, source_post_id, target_post_id, created_at)
    VALUES ${values.join(", ")}
  `).bind(...bindings);
}

function validPostBody(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return new TextEncoder().encode(value).byteLength <= MCP_LIMITS.postBytes &&
    extractPostReferenceSequences(value).length <= MCP_LIMITS.postReferences;
}

function fail(code: DomainError["code"]): PostEditResult<never> {
  return { ok: false, error: domainError(code) };
}
