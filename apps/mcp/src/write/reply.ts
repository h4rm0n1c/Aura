import type { AgentPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import { authorizeThreadReply, type ThreadState } from "../../../../packages/core/src/domain/authorization.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { createAuraId, isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { extractPostReferenceSequences } from "../../../../packages/core/src/domain/post-references.ts";
import {
  parseReplyArgs,
  type MutationResult,
  type ReplyArgs,
} from "../../../../packages/core/src/mcp/schemas.ts";
import {
  resultChanges,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from "../db/d1.ts";

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export type AgentReplyResult =
  | { readonly ok: true; readonly value: MutationResult }
  | { readonly ok: false; readonly error: DomainError };

interface ThreadRow {
  readonly state: unknown;
  readonly listing_state: unknown;
  readonly board_status: unknown;
}

interface ReferenceTargetRow {
  readonly id: unknown;
  readonly sequence: unknown;
}

interface IdempotencyRow {
  readonly operation: unknown;
  readonly request_hash: unknown;
  readonly response_json: unknown;
  readonly expires_at: unknown;
}

export async function replyAsAgent(
  db: D1DatabaseLike,
  principal: AgentPrincipal,
  input: unknown,
  nowSeconds: number,
): Promise<AgentReplyResult> {
  const parsed = parseReplyArgs(input);
  if (!parsed.ok || !validTimestamp(nowSeconds)) return fail("validation_error");
  if (!principal.capabilities.includes("post")) return fail("forbidden");
  if (typeof db.batch !== "function") return fail("internal_error");

  const args = parsed.value;
  const requestHash = await hashReplyRequest(args);
  const existing = await loadIdempotency(db, principal.agentId, args.idempotencyKey);
  if (existing !== null && existing.expiresAt > nowSeconds) {
    if (existing.operation !== "reply" || existing.requestHash !== requestHash) return fail("conflict");
    const replay = parseStoredMutation(existing.responseJson);
    return replay === null ? fail("internal_error") : { ok: true, value: replay };
  }

  const thread = await loadThreadState(db, args.threadId);
  if (thread === null || thread.boardStatus !== "active") return fail("not_found");
  if (thread.listingState === "archived") return fail("thread_archived");
  const authorized = authorizeThreadReply(principal, thread.state);
  if (!authorized.ok) return authorized;

  const targets = await resolveReferenceTargets(db, args.threadId, args.content);
  if (targets === null) return fail("internal_error");

  const postId = createAuraId("post");
  const response: MutationResult = Object.freeze({ threadId: args.threadId, postId });
  const responseJson = JSON.stringify(response);
  const expiresAt = nowSeconds + IDEMPOTENCY_TTL_SECONDS;

  const statements: D1PreparedStatementLike[] = [
    // Free the same key if its previous record is already expired. This stays in
    // the same transaction as the new record so retries cannot observe a gap.
    db.prepare(`
      DELETE FROM idempotency_records
      WHERE agent_id = ?1 AND idempotency_key = ?2 AND expires_at <= ?3
    `).bind(principal.agentId, args.idempotencyKey, nowSeconds),
    db.prepare(`
      INSERT INTO posts
        (id, thread_id, sequence, author_kind, author_human_id, author_agent_id,
         body, confidence, visibility, hidden_by_human_id, hidden_at, created_at)
      SELECT
        ?1,
        t.id,
        (SELECT COALESCE(MAX(p.sequence), 0) + 1 FROM posts p WHERE p.thread_id = t.id),
        'agent', NULL, ?2, ?3, ?4, 'visible', NULL, NULL, ?5
      FROM threads t
      JOIN boards b ON b.id = t.board_id
      WHERE t.id = ?6
        AND t.listing_state = 'live'
        AND t.state <> 'locked'
        AND b.status = 'active'
    `).bind(postId, principal.agentId, args.content, args.confidence ?? null, nowSeconds, args.threadId),
    db.prepare(`
      UPDATE threads
      SET updated_at = ?1
      WHERE id = ?2 AND listing_state = 'live' AND state <> 'locked'
    `).bind(nowSeconds, args.threadId),
  ];

  const referenceInsert = buildReferenceInsert(db, args.threadId, postId, targets, nowSeconds);
  if (referenceInsert !== null) statements.push(referenceInsert);
  statements.push(db.prepare(`
    INSERT INTO idempotency_records
      (agent_id, idempotency_key, operation, request_hash, response_json, created_at, expires_at)
    VALUES (?1, ?2, 'reply', ?3, ?4, ?5, ?6)
  `).bind(principal.agentId, args.idempotencyKey, requestHash, responseJson, nowSeconds, expiresAt));

  try {
    const results = await db.batch(statements);
    const postIndex = 1;
    const threadIndex = 2;
    const referenceIndex = targets.length > 0 ? 3 : -1;
    const idempotencyIndex = statements.length - 1;
    if (
      resultChanges(results[postIndex]) !== 1 ||
      resultChanges(results[threadIndex]) !== 1 ||
      (referenceIndex >= 0 && resultChanges(results[referenceIndex]) !== targets.length) ||
      resultChanges(results[idempotencyIndex]) !== 1
    ) {
      return fail("conflict");
    }
    return { ok: true, value: response };
  } catch {
    // A concurrent retry can win the idempotency-key insert. Re-read the row
    // and return the first successful result iff it represents this exact call.
    const raced = await loadIdempotency(db, principal.agentId, args.idempotencyKey);
    if (
      raced !== null && raced.expiresAt > nowSeconds &&
      raced.operation === "reply" && raced.requestHash === requestHash
    ) {
      const replay = parseStoredMutation(raced.responseJson);
      if (replay !== null) return { ok: true, value: replay };
    }
    return fail("conflict");
  }
}

async function loadThreadState(db: D1DatabaseLike, threadId: string): Promise<{
  readonly state: ThreadState;
  readonly listingState: "live" | "archived";
  readonly boardStatus: "active" | "archived";
} | null> {
  try {
    const row = await db.prepare(`
      SELECT t.state, t.listing_state, b.status AS board_status
      FROM threads t
      JOIN boards b ON b.id = t.board_id
      WHERE t.id = ?1
      LIMIT 1
    `).bind(threadId).first<ThreadRow>();
    if (
      row === null ||
      (row.state !== "open" && row.state !== "solved" && row.state !== "locked") ||
      (row.listing_state !== "live" && row.listing_state !== "archived") ||
      (row.board_status !== "active" && row.board_status !== "archived")
    ) return null;
    return {
      state: row.state,
      listingState: row.listing_state,
      boardStatus: row.board_status,
    };
  } catch {
    return null;
  }
}

async function resolveReferenceTargets(
  db: D1DatabaseLike,
  threadId: string,
  body: string,
): Promise<readonly { readonly postId: string; readonly sequence: number }[] | null> {
  const sequences = extractPostReferenceSequences(body);
  if (sequences.length === 0) return Object.freeze([]);
  const placeholders = sequences.map((_sequence, index) => `?${index + 2}`).join(", ");
  try {
    const result = await db.prepare(`
      SELECT id, sequence
      FROM posts
      WHERE thread_id = ?1
        AND visibility = 'visible'
        AND sequence IN (${placeholders})
      ORDER BY sequence ASC
    `).bind(threadId, ...sequences).all<ReferenceTargetRow>();
    const targets: { postId: string; sequence: number }[] = [];
    for (const row of result.results ?? []) {
      if (!isAuraId("post", row.id) || !Number.isSafeInteger(row.sequence) || (row.sequence as number) < 1) {
        return null;
      }
      targets.push(Object.freeze({ postId: row.id, sequence: row.sequence as number }));
    }
    return Object.freeze(targets);
  } catch {
    return null;
  }
}

function buildReferenceInsert(
  db: D1DatabaseLike,
  threadId: string,
  sourcePostId: string,
  targets: readonly { readonly postId: string }[],
  createdAt: number,
): D1PreparedStatementLike | null {
  if (targets.length === 0) return null;
  const values: string[] = [];
  const bindings: unknown[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const base = index * 4 + 1;
    values.push(`(?${base}, ?${base + 1}, ?${base + 2}, ?${base + 3})`);
    bindings.push(threadId, sourcePostId, targets[index].postId, createdAt);
  }
  return db.prepare(`
    INSERT INTO post_references (thread_id, source_post_id, target_post_id, created_at)
    VALUES ${values.join(", ")}
  `).bind(...bindings);
}

async function loadIdempotency(
  db: D1DatabaseLike,
  agentId: string,
  key: string,
): Promise<{
  readonly operation: string;
  readonly requestHash: string;
  readonly responseJson: string;
  readonly expiresAt: number;
} | null> {
  try {
    const row = await db.prepare(`
      SELECT operation, request_hash, response_json, expires_at
      FROM idempotency_records
      WHERE agent_id = ?1 AND idempotency_key = ?2
      LIMIT 1
    `).bind(agentId, key).first<IdempotencyRow>();
    if (row === null) return null;
    if (
      typeof row.operation !== "string" ||
      typeof row.request_hash !== "string" || !/^[0-9a-f]{64}$/.test(row.request_hash) ||
      typeof row.response_json !== "string" ||
      !validTimestamp(row.expires_at)
    ) return null;
    return {
      operation: row.operation,
      requestHash: row.request_hash,
      responseJson: row.response_json,
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}

async function hashReplyRequest(args: ReplyArgs): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    threadId: args.threadId,
    content: args.content,
    confidence: args.confidence ?? null,
  }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseStoredMutation(value: string): MutationResult | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      !isAuraId("thread", (parsed as Record<string, unknown>).threadId) ||
      !isAuraId("post", (parsed as Record<string, unknown>).postId)
    ) return null;
    return Object.freeze({
      threadId: (parsed as Record<string, unknown>).threadId as string,
      postId: (parsed as Record<string, unknown>).postId as string,
    });
  } catch {
    return null;
  }
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "forbidden" | "thread_locked" | "thread_archived" | "not_found" | "validation_error" | "conflict" | "internal_error") {
  return { ok: false as const, error: domainError(code) };
}
