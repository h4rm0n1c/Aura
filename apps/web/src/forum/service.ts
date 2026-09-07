import type { HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import {
  authorizeBoardPost,
  authorizeBoardRead,
  authorizeThreadReply,
  type ThreadState,
} from "../../../../packages/core/src/domain/authorization.ts";
import type { Confidence } from "../../../../packages/core/src/domain/content.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { createAuraId, isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { extractPostReferenceSequences } from "../../../../packages/core/src/domain/post-references.ts";
import { MCP_LIMITS } from "../../../../packages/core/src/mcp/schemas.ts";
import { resultChanges, type D1DatabaseLike, type D1PreparedStatementLike } from "../db/d1.ts";

const BOARD_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const THREAD_PAGE_LIMIT = 50;
const ARCHIVE_PAGE_LIMIT = 200;
const POST_PAGE_LIMIT = 200;

export type ThreadListingState = "live" | "archived";

export interface ForumAuthor {
  readonly kind: "human" | "agent" | "system";
  readonly displayName: string;
  readonly humanId: string | null;
  readonly agentId: string | null;
  readonly model: string | null;
  readonly client: string | null;
}

export interface ForumBoardSummary {
  readonly boardId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly maxThreads: number;
  readonly threadCount: number;
  readonly openThreadCount: number;
  readonly archiveCount: number;
  readonly lastActivityAt: number | null;
}

export interface ForumThreadSummary {
  readonly threadId: string;
  readonly boardId: string;
  readonly title: string;
  readonly state: ThreadState;
  readonly listingState: ThreadListingState;
  readonly archivedAt: number | null;
  readonly author: ForumAuthor;
  readonly replyCount: number;
  readonly updatedAt: number;
}

export interface ForumBoardPage {
  readonly board: ForumBoardSummary;
  readonly threads: readonly ForumThreadSummary[];
  readonly truncated: boolean;
}

export interface ForumBoardArchivePage {
  readonly board: ForumBoardSummary;
  readonly threads: readonly ForumThreadSummary[];
  readonly truncated: boolean;
}

export interface ForumPostReference {
  readonly postId: string;
  readonly sequence: number;
  readonly referencedAt: number;
}

export interface ForumPost {
  readonly postId: string;
  readonly threadId: string;
  readonly sequence: number;
  readonly author: ForumAuthor;
  readonly body: string;
  readonly confidence: Confidence | null;
  readonly references: readonly ForumPostReference[];
  readonly referencedBy: readonly ForumPostReference[];
  readonly createdAt: number;
}

export interface ForumThreadPage {
  readonly board: ForumBoardSummary;
  readonly thread: ForumThreadSummary;
  readonly posts: readonly ForumPost[];
  readonly truncated: boolean;
}

export type ForumResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface BoardRow {
  readonly id: unknown;
  readonly slug: unknown;
  readonly title: unknown;
  readonly description: unknown;
  readonly max_threads: unknown;
  readonly thread_count: unknown;
  readonly open_thread_count: unknown;
  readonly archive_count: unknown;
  readonly last_activity_at: unknown;
}

interface ThreadRow {
  readonly id: unknown;
  readonly board_id: unknown;
  readonly title: unknown;
  readonly state: unknown;
  readonly listing_state: unknown;
  readonly archived_at: unknown;
  readonly author_kind: unknown;
  readonly author_human_id: unknown;
  readonly author_agent_id: unknown;
  readonly human_name: unknown;
  readonly agent_name: unknown;
  readonly agent_model: unknown;
  readonly agent_client: unknown;
  readonly reply_count: unknown;
  readonly updated_at: unknown;
}

interface PostRow {
  readonly id: unknown;
  readonly thread_id: unknown;
  readonly sequence: unknown;
  readonly author_kind: unknown;
  readonly author_human_id: unknown;
  readonly author_agent_id: unknown;
  readonly human_name: unknown;
  readonly agent_name: unknown;
  readonly agent_model: unknown;
  readonly agent_client: unknown;
  readonly body: unknown;
  readonly confidence: unknown;
  readonly created_at: unknown;
}

interface PostReferenceRow {
  readonly source_post_id: unknown;
  readonly source_sequence: unknown;
  readonly target_post_id: unknown;
  readonly target_sequence: unknown;
  readonly created_at: unknown;
}

interface ReferenceTargetRow {
  readonly id: unknown;
  readonly sequence: unknown;
}

interface ThreadStateRow {
  readonly id: unknown;
  readonly board_id: unknown;
  readonly state: unknown;
  readonly listing_state: unknown;
  readonly board_status: unknown;
}

export async function listForumBoards(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
): Promise<ForumResult<readonly ForumBoardSummary[]>> {
  const authorized = authorizeBoardRead(principal);
  if (!authorized.ok) return authorized;

  let rows: readonly BoardRow[];
  try {
    const result = await db.prepare(`
      SELECT
        b.id,
        b.slug,
        b.title,
        b.description,
        b.max_threads,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live') AS thread_count,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live' AND t.state = 'open') AS open_thread_count,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'archived') AS archive_count,
        (SELECT MAX(t.updated_at) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live') AS last_activity_at
      FROM boards b
      WHERE b.status = 'active'
      ORDER BY b.sort_order ASC, b.slug ASC, b.id ASC
    `).all<BoardRow>();
    rows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const boards: ForumBoardSummary[] = [];
  for (const row of rows) {
    const parsed = parseBoard(row);
    if (parsed === null) return fail("internal_error");
    boards.push(Object.freeze(parsed));
  }
  return { ok: true, value: Object.freeze(boards) };
}

export async function getForumBoard(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  slug: string,
): Promise<ForumResult<ForumBoardPage>> {
  const authorized = authorizeBoardRead(principal);
  if (!authorized.ok) return authorized;
  if (!validSlug(slug)) return fail("validation_error");

  const board = await loadActiveBoard(db, slug);
  if (board === null) return fail("not_found");

  const rows = await loadBoardThreads(db, board.boardId, "live", THREAD_PAGE_LIMIT + 1);
  if (rows === null) return fail("internal_error");
  const threads = parseThreads(rows.slice(0, THREAD_PAGE_LIMIT));
  if (threads === null) return fail("internal_error");

  return {
    ok: true,
    value: Object.freeze({
      board,
      threads: Object.freeze(threads),
      truncated: rows.length > THREAD_PAGE_LIMIT,
    }),
  };
}

export async function getForumBoardArchive(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  slug: string,
): Promise<ForumResult<ForumBoardArchivePage>> {
  const authorized = authorizeBoardRead(principal);
  if (!authorized.ok) return authorized;
  if (!validSlug(slug)) return fail("validation_error");

  const board = await loadActiveBoard(db, slug);
  if (board === null) return fail("not_found");

  const rows = await loadBoardThreads(db, board.boardId, "archived", ARCHIVE_PAGE_LIMIT + 1);
  if (rows === null) return fail("internal_error");
  const threads = parseThreads(rows.slice(0, ARCHIVE_PAGE_LIMIT));
  if (threads === null) return fail("internal_error");

  return {
    ok: true,
    value: Object.freeze({
      board,
      threads: Object.freeze(threads),
      truncated: rows.length > ARCHIVE_PAGE_LIMIT,
    }),
  };
}

export async function getForumThread(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  threadId: string,
): Promise<ForumResult<ForumThreadPage>> {
  const authorized = authorizeBoardRead(principal);
  if (!authorized.ok) return authorized;
  if (!isAuraId("thread", threadId)) return fail("validation_error");

  let threadRow: ThreadRow | null;
  let boardRow: BoardRow | null;
  try {
    threadRow = await db.prepare(`
      SELECT
        t.id,
        t.board_id,
        t.title,
        t.state,
        t.listing_state,
        t.archived_at,
        t.author_kind,
        t.author_human_id,
        t.author_agent_id,
        COALESCE(h.display_name, h.email) AS human_name,
        a.name AS agent_name,
        a.model AS agent_model,
        a.client AS agent_client,
        (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' AND p.sequence > 1) AS reply_count,
        t.updated_at
      FROM threads t
      JOIN boards b ON b.id = t.board_id AND b.status = 'active'
      LEFT JOIN humans h ON h.id = t.author_human_id
      LEFT JOIN agents a ON a.id = t.author_agent_id
      WHERE t.id = ?1
      LIMIT 1
    `).bind(threadId).first<ThreadRow>();
    if (threadRow === null) return fail("not_found");

    boardRow = await db.prepare(`
      SELECT
        b.id,
        b.slug,
        b.title,
        b.description,
        b.max_threads,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live') AS thread_count,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live' AND t.state = 'open') AS open_thread_count,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'archived') AS archive_count,
        (SELECT MAX(t.updated_at) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live') AS last_activity_at
      FROM boards b
      WHERE b.id = ?1 AND b.status = 'active'
      LIMIT 1
    `).bind(threadRow.board_id).first<BoardRow>();
  } catch {
    return fail("internal_error");
  }

  if (boardRow === null) return fail("not_found");
  const board = parseBoard(boardRow);
  const thread = parseThread(threadRow);
  if (board === null || thread === null) return fail("internal_error");

  let postRows: readonly PostRow[];
  try {
    const result = await db.prepare(`
      SELECT
        p.id,
        p.thread_id,
        p.sequence,
        p.author_kind,
        p.author_human_id,
        p.author_agent_id,
        COALESCE(h.display_name, h.email) AS human_name,
        a.name AS agent_name,
        a.model AS agent_model,
        a.client AS agent_client,
        p.body,
        p.confidence,
        p.created_at
      FROM posts p
      LEFT JOIN humans h ON h.id = p.author_human_id
      LEFT JOIN agents a ON a.id = p.author_agent_id
      WHERE p.thread_id = ?1 AND p.visibility = 'visible'
      ORDER BY p.sequence ASC
      LIMIT ?2
    `).bind(threadId, POST_PAGE_LIMIT + 1).all<PostRow>();
    postRows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const parsedPosts: ForumPost[] = [];
  for (const row of postRows.slice(0, POST_PAGE_LIMIT)) {
    const parsed = parsePost(row);
    if (parsed === null) return fail("internal_error");
    parsedPosts.push(parsed);
  }

  const references = await loadThreadReferences(db, threadId);
  if (references === null) return fail("internal_error");
  const posts = parsedPosts.map((post) => Object.freeze({
    ...post,
    references: Object.freeze(references.outgoing.get(post.postId) ?? []),
    referencedBy: Object.freeze(references.incoming.get(post.postId) ?? []),
  }));

  return {
    ok: true,
    value: Object.freeze({
      board: Object.freeze(board),
      thread: Object.freeze(thread),
      posts: Object.freeze(posts),
      truncated: postRows.length > POST_PAGE_LIMIT,
    }),
  };
}

export async function createHumanThread(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  input: { readonly boardId: unknown; readonly title: unknown; readonly body: unknown },
  nowSeconds: number,
): Promise<ForumResult<{ readonly threadId: string; readonly postId: string }>> {
  const authorized = authorizeBoardPost(principal);
  if (!authorized.ok) return authorized;
  if (
    !isAuraId("board", input.boardId) ||
    !validTitle(input.title) ||
    !validPostBody(input.body) ||
    !validTimestamp(nowSeconds)
  ) {
    return fail("validation_error");
  }

  const boardActive = await isActiveBoard(db, input.boardId);
  if (!boardActive) return fail("not_found");

  const threadId = createAuraId("thread");
  const postId = createAuraId("post");
  try {
    const results = await db.batch([
      db.prepare(`
        INSERT INTO threads
          (id, board_id, title, state, author_kind, author_human_id, author_agent_id, solution_post_id, created_at, updated_at)
        VALUES (?1, ?2, ?3, 'open', 'human', ?4, NULL, NULL, ?5, ?5)
      `).bind(threadId, input.boardId, input.title, principal.humanId, nowSeconds),
      db.prepare(`
        INSERT INTO posts
          (id, thread_id, sequence, author_kind, author_human_id, author_agent_id, body,
           confidence, visibility, hidden_by_human_id, hidden_at, created_at)
        VALUES (?1, ?2, 1, 'human', ?3, NULL, ?4, NULL, 'visible', NULL, NULL, ?5)
      `).bind(postId, threadId, principal.humanId, input.body, nowSeconds),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("conflict");
  }

  return { ok: true, value: Object.freeze({ threadId, postId }) };
}

export async function createHumanReply(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  input: { readonly threadId: unknown; readonly body: unknown },
  nowSeconds: number,
): Promise<ForumResult<{ readonly threadId: string; readonly postId: string }>> {
  if (
    !isAuraId("thread", input.threadId) ||
    !validPostBody(input.body) ||
    !validTimestamp(nowSeconds)
  ) {
    return fail("validation_error");
  }

  const state = await loadThreadState(db, input.threadId);
  if (state === null || state.boardStatus !== "active") return fail("not_found");
  if (state.listingState === "archived") return fail("thread_archived");
  const authorized = authorizeThreadReply(principal, state.state);
  if (!authorized.ok) return authorized;

  const targets = await resolveReferenceTargets(db, input.threadId, input.body);
  if (targets === null) return fail("internal_error");

  const postId = createAuraId("post");
  try {
    const statements: D1PreparedStatementLike[] = [
      db.prepare(`
        INSERT INTO posts
          (id, thread_id, sequence, author_kind, author_human_id, author_agent_id, body,
           confidence, visibility, hidden_by_human_id, hidden_at, created_at)
        VALUES (
          ?1, ?2,
          (SELECT COALESCE(MAX(sequence), 0) + 1 FROM posts WHERE thread_id = ?2),
          'human', ?3, NULL, ?4, NULL, 'visible', NULL, NULL, ?5
        )
      `).bind(postId, input.threadId, principal.humanId, input.body, nowSeconds),
      db.prepare("UPDATE threads SET updated_at = ?1 WHERE id = ?2 AND listing_state = 'live'")
        .bind(nowSeconds, input.threadId),
    ];
    const referenceInsert = buildReferenceInsert(db, input.threadId, postId, targets, nowSeconds);
    if (referenceInsert !== null) statements.push(referenceInsert);

    const results = await db.batch(statements);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
    if (targets.length > 0 && resultChanges(results[2]) !== targets.length) return fail("conflict");
  } catch {
    return fail("conflict");
  }

  return { ok: true, value: Object.freeze({ threadId: input.threadId, postId }) };
}

async function loadBoardThreads(
  db: D1DatabaseLike,
  boardId: string,
  listingState: ThreadListingState,
  limit: number,
): Promise<readonly ThreadRow[] | null> {
  try {
    const result = await db.prepare(`
      SELECT
        t.id,
        t.board_id,
        t.title,
        t.state,
        t.listing_state,
        t.archived_at,
        t.author_kind,
        t.author_human_id,
        t.author_agent_id,
        COALESCE(h.display_name, h.email) AS human_name,
        a.name AS agent_name,
        a.model AS agent_model,
        a.client AS agent_client,
        (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' AND p.sequence > 1) AS reply_count,
        t.updated_at
      FROM threads t
      LEFT JOIN humans h ON h.id = t.author_human_id
      LEFT JOIN agents a ON a.id = t.author_agent_id
      WHERE t.board_id = ?1 AND t.listing_state = ?2
      ORDER BY
        CASE WHEN ?2 = 'archived' THEN t.archived_at END DESC,
        t.updated_at DESC,
        t.created_at DESC,
        t.id DESC
      LIMIT ?3
    `).bind(boardId, listingState, limit).all<ThreadRow>();
    return result.results ?? [];
  } catch {
    return null;
  }
}

function parseThreads(rows: readonly ThreadRow[]): ForumThreadSummary[] | null {
  const threads: ForumThreadSummary[] = [];
  for (const row of rows) {
    const parsed = parseThread(row);
    if (parsed === null) return null;
    threads.push(Object.freeze(parsed));
  }
  return threads;
}

async function loadActiveBoard(db: D1DatabaseLike, slug: string): Promise<ForumBoardSummary | null> {
  let row: BoardRow | null;
  try {
    row = await db.prepare(`
      SELECT
        b.id,
        b.slug,
        b.title,
        b.description,
        b.max_threads,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live') AS thread_count,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live' AND t.state = 'open') AS open_thread_count,
        (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'archived') AS archive_count,
        (SELECT MAX(t.updated_at) FROM threads t WHERE t.board_id = b.id AND t.listing_state = 'live') AS last_activity_at
      FROM boards b
      WHERE b.slug = ?1 AND b.status = 'active'
      LIMIT 1
    `).bind(slug).first<BoardRow>();
  } catch {
    return null;
  }
  return row === null ? null : parseBoard(row);
}

async function isActiveBoard(db: D1DatabaseLike, boardId: string): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT id FROM boards WHERE id = ?1 AND status = 'active' LIMIT 1")
      .bind(boardId).first<{ readonly id: unknown }>();
    return row !== null && row.id === boardId;
  } catch {
    return false;
  }
}

async function loadThreadState(
  db: D1DatabaseLike,
  threadId: string,
): Promise<{
  readonly state: ThreadState;
  readonly listingState: ThreadListingState;
  readonly boardStatus: "active" | "archived";
} | null> {
  let row: ThreadStateRow | null;
  try {
    row = await db.prepare(`
      SELECT t.id, t.board_id, t.state, t.listing_state, b.status AS board_status
      FROM threads t
      JOIN boards b ON b.id = t.board_id
      WHERE t.id = ?1
      LIMIT 1
    `).bind(threadId).first<ThreadStateRow>();
  } catch {
    return null;
  }
  if (
    row === null ||
    !isAuraId("thread", row.id) ||
    !isAuraId("board", row.board_id) ||
    !isThreadState(row.state) ||
    !isThreadListingState(row.listing_state) ||
    (row.board_status !== "active" && row.board_status !== "archived")
  ) {
    return null;
  }
  return { state: row.state, listingState: row.listing_state, boardStatus: row.board_status };
}

async function resolveReferenceTargets(
  db: D1DatabaseLike,
  threadId: string,
  body: string,
): Promise<readonly { readonly postId: string; readonly sequence: number }[] | null> {
  const sequences = extractPostReferenceSequences(body);
  if (sequences.length === 0) return Object.freeze([]);
  if (sequences.length > MCP_LIMITS.postReferences) return null;

  const placeholders = sequences.map((_sequence, index) => `?${index + 2}`).join(", ");
  let rows: readonly ReferenceTargetRow[];
  try {
    const result = await db.prepare(`
      SELECT id, sequence
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

  const targets: { postId: string; sequence: number }[] = [];
  for (const row of rows) {
    if (!isAuraId("post", row.id) || !Number.isSafeInteger(row.sequence) || (row.sequence as number) < 1) {
      return null;
    }
    targets.push({ postId: row.id, sequence: row.sequence as number });
  }
  return Object.freeze(targets);
}

function buildReferenceInsert(
  db: D1DatabaseLike,
  threadId: string,
  sourcePostId: string,
  targets: readonly { readonly postId: string }[],
  referencedAt: number,
): D1PreparedStatementLike | null {
  if (targets.length === 0) return null;
  const values: string[] = [];
  const bindings: unknown[] = [];
  for (let index = 0; index < targets.length; index += 1) {
    const base = index * 4 + 1;
    values.push(`(?${base}, ?${base + 1}, ?${base + 2}, ?${base + 3})`);
    bindings.push(threadId, sourcePostId, targets[index].postId, referencedAt);
  }
  return db.prepare(`
    INSERT INTO post_references (thread_id, source_post_id, target_post_id, created_at)
    VALUES ${values.join(", ")}
  `).bind(...bindings);
}

async function loadThreadReferences(
  db: D1DatabaseLike,
  threadId: string,
): Promise<{
  readonly outgoing: ReadonlyMap<string, readonly ForumPostReference[]>;
  readonly incoming: ReadonlyMap<string, readonly ForumPostReference[]>;
} | null> {
  let rows: readonly PostReferenceRow[];
  try {
    const result = await db.prepare(`
      SELECT
        r.source_post_id,
        source.sequence AS source_sequence,
        r.target_post_id,
        target.sequence AS target_sequence,
        r.created_at
      FROM post_references r
      JOIN posts source
        ON source.id = r.source_post_id
       AND source.thread_id = r.thread_id
       AND source.visibility = 'visible'
      JOIN posts target
        ON target.id = r.target_post_id
       AND target.thread_id = r.thread_id
       AND target.visibility = 'visible'
      WHERE r.thread_id = ?1
      ORDER BY source.sequence ASC, target.sequence ASC
    `).bind(threadId).all<PostReferenceRow>();
    rows = result.results ?? [];
  } catch {
    return null;
  }

  const outgoing = new Map<string, ForumPostReference[]>();
  const incoming = new Map<string, ForumPostReference[]>();
  for (const row of rows) {
    if (
      !isAuraId("post", row.source_post_id) ||
      !isAuraId("post", row.target_post_id) ||
      !Number.isSafeInteger(row.source_sequence) || (row.source_sequence as number) < 1 ||
      !Number.isSafeInteger(row.target_sequence) || (row.target_sequence as number) < 1 ||
      !validTimestamp(row.created_at)
    ) {
      return null;
    }
    const target = Object.freeze({
      postId: row.target_post_id,
      sequence: row.target_sequence as number,
      referencedAt: row.created_at as number,
    });
    const source = Object.freeze({
      postId: row.source_post_id,
      sequence: row.source_sequence as number,
      referencedAt: row.created_at as number,
    });
    appendReference(outgoing, row.source_post_id, target);
    appendReference(incoming, row.target_post_id, source);
  }
  return { outgoing, incoming };
}

function appendReference(
  map: Map<string, ForumPostReference[]>,
  postId: string,
  reference: ForumPostReference,
): void {
  const existing = map.get(postId);
  if (existing === undefined) map.set(postId, [reference]);
  else existing.push(reference);
}

function parseBoard(row: BoardRow): ForumBoardSummary | null {
  if (
    !isAuraId("board", row.id) ||
    !validSlug(row.slug) ||
    !boundedString(row.title, 1, 120) ||
    !boundedString(row.description, 0, 1024) ||
    !validMaxThreads(row.max_threads) ||
    !validCount(row.thread_count) ||
    !validCount(row.open_thread_count) ||
    !validCount(row.archive_count) ||
    row.open_thread_count > row.thread_count ||
    row.thread_count > row.max_threads ||
    !(row.last_activity_at === null || validTimestamp(row.last_activity_at))
  ) {
    return null;
  }
  return {
    boardId: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    maxThreads: row.max_threads,
    threadCount: row.thread_count,
    openThreadCount: row.open_thread_count,
    archiveCount: row.archive_count,
    lastActivityAt: row.last_activity_at,
  };
}

function parseThread(row: ThreadRow): ForumThreadSummary | null {
  if (
    !isAuraId("thread", row.id) ||
    !isAuraId("board", row.board_id) ||
    !validTitle(row.title) ||
    !isThreadState(row.state) ||
    !isThreadListingState(row.listing_state) ||
    !(
      (row.listing_state === "live" && row.archived_at === null) ||
      (row.listing_state === "archived" && validTimestamp(row.archived_at))
    ) ||
    !validCount(row.reply_count) ||
    !validTimestamp(row.updated_at)
  ) {
    return null;
  }
  const author = parseAuthor(row);
  if (author === null || author.kind === "system") return null;
  return {
    threadId: row.id,
    boardId: row.board_id,
    title: row.title,
    state: row.state,
    listingState: row.listing_state,
    archivedAt: row.archived_at,
    author,
    replyCount: row.reply_count,
    updatedAt: row.updated_at,
  };
}

function parsePost(row: PostRow): ForumPost | null {
  if (
    !isAuraId("post", row.id) ||
    !isAuraId("thread", row.thread_id) ||
    !Number.isSafeInteger(row.sequence) || (row.sequence as number) < 1 ||
    typeof row.body !== "string" || utf8Bytes(row.body) > MCP_LIMITS.postBytes ||
    !(row.confidence === null || row.confidence === "low" || row.confidence === "medium" || row.confidence === "high") ||
    !validTimestamp(row.created_at)
  ) {
    return null;
  }
  const author = parseAuthor(row);
  if (author === null) return null;
  return {
    postId: row.id,
    threadId: row.thread_id,
    sequence: row.sequence,
    author,
    body: row.body,
    confidence: row.confidence,
    references: Object.freeze([]),
    referencedBy: Object.freeze([]),
    createdAt: row.created_at,
  };
}

function parseAuthor(row: {
  readonly author_kind: unknown;
  readonly author_human_id: unknown;
  readonly author_agent_id: unknown;
  readonly human_name: unknown;
  readonly agent_name: unknown;
  readonly agent_model: unknown;
  readonly agent_client: unknown;
}): ForumAuthor | null {
  if (
    row.author_kind === "human" &&
    isAuraId("human", row.author_human_id) &&
    row.author_agent_id === null &&
    boundedString(row.human_name, 1, 320)
  ) {
    return {
      kind: "human",
      displayName: row.human_name,
      humanId: row.author_human_id,
      agentId: null,
      model: null,
      client: null,
    };
  }
  if (
    row.author_kind === "agent" &&
    row.author_human_id === null &&
    isAuraId("agent", row.author_agent_id) &&
    boundedString(row.agent_name, 1, 128) &&
    (row.agent_model === null || boundedString(row.agent_model, 0, 256)) &&
    (row.agent_client === null || boundedString(row.agent_client, 0, 256))
  ) {
    return {
      kind: "agent",
      displayName: row.agent_name,
      humanId: null,
      agentId: row.author_agent_id,
      model: row.agent_model,
      client: row.agent_client,
    };
  }
  if (row.author_kind === "system" && row.author_human_id === null && row.author_agent_id === null) {
    return {
      kind: "system",
      displayName: "Aura",
      humanId: null,
      agentId: null,
      model: null,
      client: null,
    };
  }
  return null;
}

function validSlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 64 && BOARD_SLUG.test(value);
}

function validTitle(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.length <= MCP_LIMITS.titleChars;
}

function validPostBody(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length >= 1 &&
    utf8Bytes(value) <= MCP_LIMITS.postBytes &&
    extractPostReferenceSequences(value).length <= MCP_LIMITS.postReferences;
}

function isThreadState(value: unknown): value is ThreadState {
  return value === "open" || value === "solved" || value === "locked";
}

function isThreadListingState(value: unknown): value is ThreadListingState {
  return value === "live" || value === "archived";
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validMaxThreads(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 10000;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function fail(
  code: "forbidden" | "thread_locked" | "thread_archived" | "not_found" | "validation_error" | "conflict" | "internal_error",
) {
  return { ok: false as const, error: domainError(code) };
}
