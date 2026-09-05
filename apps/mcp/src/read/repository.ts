import type { AgentPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import { authorizeBoardRead } from "../../../../packages/core/src/domain/authorization.ts";
import {
  boardText,
  type AuthorRef,
  type Confidence,
} from "../../../../packages/core/src/domain/content.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import {
  MCP_LIMITS,
  type BoardSummary,
  type Page,
  type PostView,
  type SearchHit,
  type ThreadSummary,
  type ThreadView,
} from "../../../../packages/core/src/mcp/schemas.ts";
import type { D1DatabaseLike } from "../db/d1.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface BoardRow {
  id: unknown;
  slug: unknown;
  title: unknown;
  description: unknown;
}

interface ThreadRow {
  threadId: unknown;
  boardId: unknown;
  title: unknown;
  state: unknown;
  authorKind: unknown;
  authorHumanId: unknown;
  authorAgentId: unknown;
  replyCount: unknown;
  updatedAt: unknown;
}

interface PostRow {
  postId: unknown;
  threadId: unknown;
  sequence: unknown;
  authorKind: unknown;
  authorHumanId: unknown;
  authorAgentId: unknown;
  body: unknown;
  confidence: unknown;
  parentPostId: unknown;
  createdAt: unknown;
}

interface SearchRow extends PostRow {
  boardId: unknown;
  threadTitle: unknown;
  threadAuthorKind: unknown;
  threadAuthorHumanId: unknown;
  threadAuthorAgentId: unknown;
}

const SYSTEM_AUTHOR = Object.freeze({ kind: "system", label: "aura" }) as const;

export async function listBoards(
  db: D1DatabaseLike,
  principal: AgentPrincipal,
  cursorValue?: string,
  limit = MCP_LIMITS.defaultPageSize,
): Promise<ReadResult<Page<BoardSummary>>> {
  const denied = authorizeBoardRead(principal);
  if (!denied.ok) return denied;
  if (!validLimit(limit)) return invalid();

  const cursor = decodeCursor("boards", cursorValue);
  if (cursorValue !== undefined && cursor === null) return invalid();

  const rows = await db
    .prepare(`SELECT id, slug, title, description
      FROM boards
      WHERE (?1 IS NULL OR slug > ?1 OR (slug = ?1 AND id > ?2))
      ORDER BY slug ASC, id ASC
      LIMIT ?3`)
    .bind(
      cursor?.k === "boards" ? cursor.slug : null,
      cursor?.k === "boards" ? cursor.id : null,
      limit + 1,
    )
    .all<BoardRow>();

  const items: BoardSummary[] = [];
  for (const row of rows.results.slice(0, limit)) {
    if (
      !isAuraId("board", row.id) ||
      !isBoardSlug(row.slug) ||
      !boundedString(row.title, 1, 120) ||
      !boundedString(row.description, 0, 1024)
    ) {
      return internal();
    }
    items.push(Object.freeze({
      boardId: row.id,
      slug: row.slug,
      title: boardText(SYSTEM_AUTHOR, row.title),
      description: boardText(SYSTEM_AUTHOR, row.description),
    }));
  }

  const tail = rows.results.length > limit ? rows.results[limit - 1] : null;
  const nextCursor = tail && isBoardSlug(tail.slug) && isAuraId("board", tail.id)
    ? encodeCursor({ v: 1, k: "boards", slug: tail.slug, id: tail.id })
    : null;

  return ok(Object.freeze({ items: Object.freeze(items), nextCursor }));
}

export async function listThreads(
  db: D1DatabaseLike,
  principal: AgentPrincipal,
  boardId: string,
  cursorValue?: string,
  limit = MCP_LIMITS.defaultPageSize,
): Promise<ReadResult<Page<ThreadSummary>>> {
  const denied = authorizeBoardRead(principal);
  if (!denied.ok) return denied;
  if (!isAuraId("board", boardId) || !validLimit(limit)) return invalid();

  const cursor = decodeCursor("threads", cursorValue);
  if (cursorValue !== undefined && cursor === null) return invalid();

  const timestamp = cursor?.k === "threads" ? cursor.ts : null;
  const cursorId = cursor?.k === "threads" ? cursor.id : null;
  const rows = await db
    .prepare(`SELECT
        t.id AS threadId,
        t.board_id AS boardId,
        t.title AS title,
        t.state AS state,
        t.author_kind AS authorKind,
        t.author_human_id AS authorHumanId,
        t.author_agent_id AS authorAgentId,
        (SELECT COUNT(*)
          FROM posts p
          WHERE p.thread_id = t.id AND p.visibility = 'visible' AND p.sequence > 1) AS replyCount,
        t.updated_at AS updatedAt
      FROM threads t
      WHERE t.board_id = ?1
        AND (?2 IS NULL OR t.updated_at < ?2 OR (t.updated_at = ?2 AND t.id < ?3))
      ORDER BY t.updated_at DESC, t.id DESC
      LIMIT ?4`)
    .bind(boardId, timestamp, cursorId, limit + 1)
    .all<ThreadRow>();

  const items: ThreadSummary[] = [];
  for (const row of rows.results.slice(0, limit)) {
    const summary = mapThread(row);
    if (summary === null) return internal();
    items.push(summary);
  }

  const tail = rows.results.length > limit ? rows.results[limit - 1] : null;
  const nextCursor = tail &&
    isNonNegativeInteger(tail.updatedAt) &&
    isAuraId("thread", tail.threadId)
    ? encodeCursor({ v: 1, k: "threads", ts: tail.updatedAt, id: tail.threadId })
    : null;

  return ok(Object.freeze({ items: Object.freeze(items), nextCursor }));
}

export async function readThread(
  db: D1DatabaseLike,
  principal: AgentPrincipal,
  threadId: string,
  cursorValue?: string,
  limit = MCP_LIMITS.defaultPageSize,
): Promise<ReadResult<ThreadView>> {
  const denied = authorizeBoardRead(principal);
  if (!denied.ok) return denied;
  if (!isAuraId("thread", threadId) || !validLimit(limit)) return invalid();

  const cursor = decodeCursor("posts", cursorValue);
  if (cursorValue !== undefined && cursor === null) return invalid();

  const threadRow = await db
    .prepare(`SELECT
        t.id AS threadId,
        t.board_id AS boardId,
        t.title AS title,
        t.state AS state,
        t.author_kind AS authorKind,
        t.author_human_id AS authorHumanId,
        t.author_agent_id AS authorAgentId,
        (SELECT COUNT(*)
          FROM posts p
          WHERE p.thread_id = t.id AND p.visibility = 'visible' AND p.sequence > 1) AS replyCount,
        t.updated_at AS updatedAt
      FROM threads t
      WHERE t.id = ?1
      LIMIT 1`)
    .bind(threadId)
    .first<ThreadRow>();

  if (threadRow === null) return { ok: false, error: domainError("not_found") };
  const thread = mapThread(threadRow);
  if (thread === null) return internal();

  const afterSequence = cursor?.k === "posts" ? cursor.sequence : 0;
  const rows = await db
    .prepare(`SELECT
        p.id AS postId,
        p.thread_id AS threadId,
        p.sequence AS sequence,
        p.author_kind AS authorKind,
        p.author_human_id AS authorHumanId,
        p.author_agent_id AS authorAgentId,
        p.body AS body,
        p.confidence AS confidence,
        p.parent_post_id AS parentPostId,
        p.created_at AS createdAt
      FROM posts p
      WHERE p.thread_id = ?1
        AND p.visibility = 'visible'
        AND p.sequence > ?2
      ORDER BY p.sequence ASC
      LIMIT ?3`)
    .bind(threadId, afterSequence, limit + 1)
    .all<PostRow>();

  const posts: PostView[] = [];
  for (const row of rows.results.slice(0, limit)) {
    const post = mapPost(row);
    if (post === null) return internal();
    posts.push(post);
  }

  const tail = rows.results.length > limit ? rows.results[limit - 1] : null;
  const nextCursor = tail && isPositiveInteger(tail.sequence)
    ? encodeCursor({ v: 1, k: "posts", sequence: tail.sequence })
    : null;

  return ok(Object.freeze({
    thread,
    posts: Object.freeze({ items: Object.freeze(posts), nextCursor }),
  }));
}

export async function search(
  db: D1DatabaseLike,
  principal: AgentPrincipal,
  query: string,
  boardId?: string,
  cursorValue?: string,
  limit = MCP_LIMITS.defaultPageSize,
): Promise<ReadResult<Page<SearchHit>>> {
  const denied = authorizeBoardRead(principal);
  if (!denied.ok) return denied;
  if (
    typeof query !== "string" ||
    query.length < 1 ||
    query.length > MCP_LIMITS.searchChars ||
    !validLimit(limit)
  ) {
    return invalid();
  }
  if (boardId !== undefined && !isAuraId("board", boardId)) return invalid();

  const cursor = decodeCursor("search", cursorValue);
  if (cursorValue !== undefined && cursor === null) return invalid();

  const timestamp = cursor?.k === "search" ? cursor.ts : null;
  const cursorId = cursor?.k === "search" ? cursor.id : null;
  const rows = await db
    .prepare(`SELECT
        t.board_id AS boardId,
        t.id AS threadId,
        t.title AS threadTitle,
        t.author_kind AS threadAuthorKind,
        t.author_human_id AS threadAuthorHumanId,
        t.author_agent_id AS threadAuthorAgentId,
        p.id AS postId,
        p.sequence AS sequence,
        p.author_kind AS authorKind,
        p.author_human_id AS authorHumanId,
        p.author_agent_id AS authorAgentId,
        p.body AS body,
        p.confidence AS confidence,
        p.parent_post_id AS parentPostId,
        p.created_at AS createdAt
      FROM posts p
      JOIN threads t ON t.id = p.thread_id
      WHERE p.visibility = 'visible'
        AND (?2 IS NULL OR t.board_id = ?2)
        AND (
          instr(lower(p.body), lower(?1)) > 0
          OR (
            instr(lower(t.title), lower(?1)) > 0
            AND p.sequence = (
              SELECT MIN(p2.sequence)
              FROM posts p2
              WHERE p2.thread_id = t.id AND p2.visibility = 'visible'
            )
          )
        )
        AND (?3 IS NULL OR p.created_at < ?3 OR (p.created_at = ?3 AND p.id < ?4))
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?5`)
    .bind(query, boardId ?? null, timestamp, cursorId, limit + 1)
    .all<SearchRow>();

  const items: SearchHit[] = [];
  for (const row of rows.results.slice(0, limit)) {
    const hit = mapSearch(row);
    if (hit === null) return internal();
    items.push(hit);
  }

  const tail = rows.results.length > limit ? rows.results[limit - 1] : null;
  const nextCursor = tail &&
    isNonNegativeInteger(tail.createdAt) &&
    isAuraId("post", tail.postId)
    ? encodeCursor({ v: 1, k: "search", ts: tail.createdAt, id: tail.postId })
    : null;

  return ok(Object.freeze({ items: Object.freeze(items), nextCursor }));
}

function mapThread(row: ThreadRow): ThreadSummary | null {
  if (
    !isAuraId("thread", row.threadId) ||
    !isAuraId("board", row.boardId) ||
    !boundedString(row.title, 1, MCP_LIMITS.titleChars) ||
    !isThreadState(row.state) ||
    !isNonNegativeInteger(row.replyCount) ||
    !isNonNegativeInteger(row.updatedAt)
  ) {
    return null;
  }

  const author = rowAuthor(row.authorKind, row.authorHumanId, row.authorAgentId);
  if (author === null || author.kind === "system") return null;

  const lastActivityAt = isoTime(row.updatedAt);
  if (lastActivityAt === null) return null;

  return Object.freeze({
    threadId: row.threadId,
    boardId: row.boardId,
    title: boardText(author, row.title),
    state: row.state,
    author,
    replyCount: row.replyCount,
    lastActivityAt,
  });
}

function mapPost(row: PostRow): PostView | null {
  if (
    !isAuraId("post", row.postId) ||
    !isAuraId("thread", row.threadId) ||
    !isPositiveInteger(row.sequence) ||
    typeof row.body !== "string" ||
    utf8Bytes(row.body) > MCP_LIMITS.postBytes ||
    !isConfidenceOrNull(row.confidence) ||
    (row.parentPostId !== null && !isAuraId("post", row.parentPostId)) ||
    !isNonNegativeInteger(row.createdAt)
  ) {
    return null;
  }

  const author = rowAuthor(row.authorKind, row.authorHumanId, row.authorAgentId);
  if (author === null) return null;

  const createdAt = isoTime(row.createdAt);
  if (createdAt === null) return null;

  return Object.freeze({
    postId: row.postId,
    threadId: row.threadId,
    sequence: row.sequence,
    author,
    content: boardText(author, row.body),
    confidence: row.confidence,
    parentPostId: row.parentPostId,
    createdAt,
  });
}

function mapSearch(row: SearchRow): SearchHit | null {
  const post = mapPost(row);
  if (
    post === null ||
    !isAuraId("board", row.boardId) ||
    !boundedString(row.threadTitle, 1, MCP_LIMITS.titleChars)
  ) {
    return null;
  }

  const threadAuthor = rowAuthor(
    row.threadAuthorKind,
    row.threadAuthorHumanId,
    row.threadAuthorAgentId,
  );
  if (threadAuthor === null || threadAuthor.kind === "system") return null;

  return Object.freeze({
    boardId: row.boardId,
    threadId: post.threadId,
    postId: post.postId,
    threadTitle: boardText(threadAuthor, row.threadTitle),
    author: post.author,
    content: post.content,
    createdAt: post.createdAt,
  });
}

function rowAuthor(
  kind: unknown,
  humanId: unknown,
  agentId: unknown,
): AuthorRef | null {
  if (kind === "human" && isAuraId("human", humanId) && agentId === null) {
    return Object.freeze({ kind: "human", humanId });
  }
  if (kind === "agent" && isAuraId("agent", agentId) && humanId === null) {
    return Object.freeze({ kind: "agent", agentId });
  }
  if (kind === "system" && humanId === null && agentId === null) return SYSTEM_AUTHOR;
  return null;
}

function validLimit(limit: number): boolean {
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MCP_LIMITS.maxPageSize;
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isBoardSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isThreadState(value: unknown): value is "open" | "solved" | "locked" {
  return value === "open" || value === "solved" || value === "locked";
}

function isConfidenceOrNull(value: unknown): value is Confidence | null {
  return value === null || value === "low" || value === "medium" || value === "high";
}

function isoTime(seconds: number): string | null {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ok<T>(value: T): ReadResult<T> {
  return { ok: true, value };
}

function invalid<T>(): ReadResult<T> {
  return { ok: false, error: domainError("validation_error") };
}

function internal<T>(): ReadResult<T> {
  return { ok: false, error: domainError("internal_error") };
}
