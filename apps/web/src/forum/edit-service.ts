import type { HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { MCP_LIMITS } from "../../../../packages/core/src/mcp/schemas.ts";
import { resultChanges, type D1DatabaseLike } from "../db/d1.ts";

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

  try {
    const result = await db.prepare(`
      UPDATE posts
      SET body = ?1, edited_at = ?2, edited_by_human_id = ?3
      WHERE id = ?4
        AND thread_id = ?5
        AND author_kind = 'human'
        AND author_human_id = ?3
        AND visibility = 'visible'
    `).bind(input.body, nowSeconds, principal.humanId, input.postId, input.threadId).run();
    if (resultChanges(result) !== 1) return fail("conflict");
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

function validPostBody(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  return new TextEncoder().encode(value).byteLength <= MCP_LIMITS.postBytes;
}

function fail(code: DomainError["code"]): PostEditResult<never> {
  return { ok: false, error: domainError(code) };
}
