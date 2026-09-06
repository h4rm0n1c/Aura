import {
  csrfAction,
  importCsrfKey,
  issueCsrfToken,
  verifyCsrfToken,
} from "../../../../packages/core/src/auth/csrf.ts";
import {
  isHumanRole,
  principalKey,
  type HumanPrincipal,
  type HumanRole,
} from "../../../../packages/core/src/auth/principals.ts";
import {
  isBoardStaffRole,
  type BoardStaffRole,
} from "../../../../packages/core/src/domain/authorization.ts";
import { MCP_LIMITS } from "../../../../packages/core/src/mcp/schemas.ts";
import type { D1DatabaseLike } from "../db/d1.ts";
import { escapeHtml, htmlPage, redirectResponse, textResponse } from "../ui.ts";
import {
  createHumanReply,
  createHumanThread,
  getForumBoard,
  getForumBoardArchive,
  getForumThread,
  listForumBoards,
  type ForumAuthor,
  type ForumBoardSummary,
  type ForumPost,
  type ForumThreadPage,
  type ForumThreadSummary,
} from "./service.ts";

const BOARD_SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const THREAD_ID = "thr_[A-Za-z0-9_-]{22}";
const POST_ID = "pst_[A-Za-z0-9_-]{22}";
const BOARD_SLUG_VALUE = new RegExp(`^${BOARD_SLUG}$`);
const THREAD_ID_VALUE = new RegExp(`^${THREAD_ID}$`);
const POST_ID_VALUE = new RegExp(`^${POST_ID}$`);
const BOARD_PATH = new RegExp(`^/b/(${BOARD_SLUG})$`);
const BOARD_ARCHIVE_PATH = new RegExp(`^/b/(${BOARD_SLUG})/archive$`);
const BOARD_CREATE_THREAD_PATH = new RegExp(`^/b/(${BOARD_SLUG})/threads$`);
const THREAD_PATH = new RegExp(`^/t/(${THREAD_ID})$`);
const THREAD_REPLY_PATH = new RegExp(`^/t/(${THREAD_ID})/reply$`);
const THREAD_REPLY_TO_PATH = new RegExp(`^/t/(${THREAD_ID})/reply-to/(${POST_ID})$`);
const MAX_FORM_BYTES = 48 * 1024;
const RECENT_THREAD_LIMIT = 5;
const RECENT_EXCERPT_CHARS = 220;

type ForumHumanAuthority = "site-admin" | "site-moderator" | "board-manager" | "board-moderator";

interface HumanAuthorityRow {
  readonly human_id: unknown;
  readonly site_role: unknown;
  readonly board_role: unknown;
}

interface RecentThreadRow {
  readonly thread_id: unknown;
  readonly title: unknown;
  readonly state: unknown;
  readonly board_slug: unknown;
  readonly reply_count: unknown;
  readonly excerpt_post_id: unknown;
  readonly excerpt_sequence: unknown;
  readonly excerpt_body: unknown;
  readonly updated_at: unknown;
}

interface RecentThreadSummary {
  readonly threadId: string;
  readonly title: string;
  readonly state: "open" | "solved" | "locked";
  readonly boardSlug: string;
  readonly replyCount: number;
  readonly excerptPostId: string;
  readonly excerptSequence: number;
  readonly excerptBody: string;
  readonly updatedAt: number;
}

export async function handleForumRequest(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET") {
    if (url.pathname === "/") return boardIndexPage(db, principal);

    const archiveMatch = url.pathname.match(BOARD_ARCHIVE_PATH);
    if (archiveMatch !== null) return boardArchivePage(db, principal, archiveMatch[1]);

    const boardMatch = url.pathname.match(BOARD_PATH);
    if (boardMatch !== null) return boardPage(db, csrfKey, principal, boardMatch[1]);

    const threadMatch = url.pathname.match(THREAD_PATH);
    if (threadMatch !== null) return threadPage(db, csrfKey, principal, threadMatch[1], null);

    const replyToMatch = url.pathname.match(THREAD_REPLY_TO_PATH);
    if (replyToMatch !== null) {
      return threadPage(db, csrfKey, principal, replyToMatch[1], replyToMatch[2]);
    }
    return null;
  }

  if (request.method === "POST") {
    const createMatch = url.pathname.match(BOARD_CREATE_THREAD_PATH);
    if (createMatch !== null) {
      return createThreadPost(request, db, csrfKey, principal, url, createMatch[1]);
    }

    const replyMatch = url.pathname.match(THREAD_REPLY_PATH);
    if (replyMatch !== null) {
      return createReplyPost(request, db, csrfKey, principal, url, replyMatch[1]);
    }
    return null;
  }

  if (
    url.pathname === "/" ||
    BOARD_PATH.test(url.pathname) ||
    BOARD_ARCHIVE_PATH.test(url.pathname) ||
    BOARD_CREATE_THREAD_PATH.test(url.pathname) ||
    THREAD_PATH.test(url.pathname) ||
    THREAD_REPLY_PATH.test(url.pathname) ||
    THREAD_REPLY_TO_PATH.test(url.pathname)
  ) {
    return methodNotAllowed("GET, POST");
  }

  return null;
}

async function boardIndexPage(db: D1DatabaseLike, principal: HumanPrincipal): Promise<Response> {
  const result = await listForumBoards(db, principal);
  if (!result.ok) return forumErrorPage(result.error.code, principal, "/");
  const recent = await loadRecentThreads(db);
  if (recent === null) return forumErrorPage("internal_error", principal, "/");

  const rows = result.value.map(renderBoardIndexRow).join("");
  const recentRows = recent.map(renderRecentThreadRow).join("");
  const empty = principal.role === "admin"
    ? `<div class="box"><p>No active boards exist.</p><p><a href="/admin/boards">Create the first board</a>.</p></div>`
    : `<div class="box"><p>No active boards exist.</p></div>`;
  const adminAction = principal.role === "admin"
    ? `<a class="forum-action" href="/admin/boards">Manage boards</a>`
    : "";
  const recentHtml = recent.length === 0
    ? `<div class="box"><p>No active threads yet.</p></div>`
    : `<div class="table-wrap"><table class="recent-thread-list"><thead><tr><th>Board</th><th>Thread / latest post</th><th>Replies</th><th>Last activity</th></tr></thead><tbody>${recentRows}</tbody></table></div>`;

  return htmlPage(
    "Boards",
    `<div class="forum-heading"><div><h1>Boards</h1><p class="meta">Human and agent discussion in the same durable threads.</p></div><div class="forum-actions">${adminAction}</div></div>
<h2>Recent threads</h2>
${recentHtml}
<h2>All boards</h2>
${result.value.length === 0 ? empty : `<div class="table-wrap"><table class="board-index"><thead><tr><th>Board</th><th>Live</th><th>Open</th><th>Archive</th><th>Last activity</th></tr></thead><tbody>${rows}</tbody></table></div>`}`,
    { principal, boards: result.value },
  );
}

function renderRecentThreadRow(thread: RecentThreadSummary): string {
  const excerptLabel = thread.excerptSequence > 1 ? `&gt;&gt;${thread.excerptSequence}` : "OP";
  return `<tr>
<td class="recent-board-cell"><a class="board-slug" href="/b/${escapeHtml(thread.boardSlug)}">/${escapeHtml(thread.boardSlug)}/</a></td>
<td class="recent-thread-cell"><div class="recent-thread-title"><span class="thread-state state-${escapeHtml(thread.state)}">${escapeHtml(thread.state)}</span><a class="thread-title-link" href="/t/${escapeHtml(thread.threadId)}">${escapeHtml(thread.title)}</a></div><div class="recent-excerpt"><a class="recent-excerpt-ref" href="/t/${escapeHtml(thread.threadId)}#p-${escapeHtml(thread.excerptPostId)}">${excerptLabel}</a> ${escapeHtml(makeExcerpt(thread.excerptBody))}</div></td>
<td class="count-cell">${thread.replyCount}</td>
<td class="activity-cell"><time datetime="${escapeHtml(isoTime(thread.updatedAt))}">${escapeHtml(formatTimestamp(thread.updatedAt))}</time></td>
</tr>`;
}

function renderBoardIndexRow(board: ForumBoardSummary): string {
  return `<tr>
<td class="board-cell"><a class="board-link" href="/b/${escapeHtml(board.slug)}"><span class="board-slug">/${escapeHtml(board.slug)}/</span><span class="board-title">${escapeHtml(board.title)}</span></a>${board.description ? `<div class="board-description">${escapeHtml(board.description)}</div>` : ""}</td>
<td class="count-cell">${board.threadCount}/${board.maxThreads}</td>
<td class="count-cell">${board.openThreadCount}</td>
<td class="count-cell"><a href="/b/${escapeHtml(board.slug)}/archive">${board.archiveCount}</a></td>
<td class="activity-cell">${board.lastActivityAt === null ? "—" : `<time datetime="${escapeHtml(isoTime(board.lastActivityAt))}">${escapeHtml(formatTimestamp(board.lastActivityAt))}</time>`}</td>
</tr>`;
}

async function boardPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  slug: string,
): Promise<Response> {
  const result = await getForumBoard(db, principal, slug);
  if (!result.ok) return forumErrorPage(result.error.code, principal, "/");
  const { board, threads, truncated } = result.value;
  const createPath = `/b/${board.slug}/threads`;
  const csrf = await issueForumCsrf(csrfKey, principal, createPath);
  const threadRows = threads.map(renderThreadRow).join("");
  const boards = await loadBoardNavigation(db, principal);
  const adminAction = principal.role === "admin"
    ? `<a class="forum-action" href="/admin/boards/${escapeHtml(board.boardId)}">Board settings</a>`
    : "";

  return htmlPage(
    `/${board.slug}/`,
    `<div class="forum-heading"><div><h1>/${escapeHtml(board.slug)}/ — ${escapeHtml(board.title)}</h1>${board.description ? `<p>${escapeHtml(board.description)}</p>` : ""}</div><div class="forum-actions"><a class="forum-action" href="/b/${escapeHtml(board.slug)}/archive">Archive</a><a class="forum-action forum-action-primary" href="#new-thread">Start thread</a>${adminAction}</div></div>
<p><a href="/">← Boards</a></p>
<div class="thread-stats meta">${board.threadCount}/${board.maxThreads} live threads · ${board.openThreadCount} open · ${board.archiveCount} archived</div>
<h2>Threads</h2>
${threads.length === 0 ? `<div class="box"><p>No live threads yet.</p></div>` : `<div class="table-wrap"><table class="thread-list"><thead><tr><th>State</th><th>Thread</th><th>Author</th><th>Replies</th><th>Last activity</th></tr></thead><tbody>${threadRows}</tbody></table></div>`}
${truncated ? `<p class="meta">Showing the 50 most recently active live threads.</p>` : ""}
<h2 id="new-thread">Start a thread</h2>
<div class="box composer">
<form method="post" action="${escapeHtml(createPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<p><label for="thread-title">Title</label><input id="thread-title" type="text" name="title" maxlength="${MCP_LIMITS.titleChars}" required></p>
<p><label for="thread-body">Post</label><textarea id="thread-body" name="body" rows="9" required></textarea></p>
<p class="meta">Plain text · maximum ${MCP_LIMITS.postBytes.toLocaleString("en-US")} UTF-8 bytes · creating a new thread may push the least recently active live thread into the archive.</p>
<button type="submit">Create thread</button>
</form>
</div>`,
    { principal, boards, activeBoardSlug: board.slug },
  );
}

async function boardArchivePage(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  slug: string,
): Promise<Response> {
  const result = await getForumBoardArchive(db, principal, slug);
  if (!result.ok) return forumErrorPage(result.error.code, principal, "/");
  const { board, threads, truncated } = result.value;
  const boards = await loadBoardNavigation(db, principal);
  const rows = threads.map(renderArchiveThreadRow).join("");

  return htmlPage(
    `/${board.slug}/ archive`,
    `<div class="forum-heading"><div><h1>/${escapeHtml(board.slug)}/ — Archive</h1><p class="meta">Threads that fell off the live board. Archived threads are durable and read-only.</p></div><div class="forum-actions"><a class="forum-action" href="/b/${escapeHtml(board.slug)}">Return to board</a></div></div>
${threads.length === 0 ? `<div class="box"><p>No archived threads yet.</p></div>` : `<div class="table-wrap"><table class="archive-thread-list"><thead><tr><th>State</th><th>Thread</th><th>Replies</th><th>Last activity</th><th>Archived</th></tr></thead><tbody>${rows}</tbody></table></div>`}
${truncated ? `<p class="meta">Showing the 200 most recently archived threads.</p>` : ""}`,
    { principal, boards, activeBoardSlug: board.slug },
  );
}

function renderArchiveThreadRow(thread: ForumThreadSummary): string {
  return `<tr>
<td><span class="thread-state state-${escapeHtml(thread.state)}">${escapeHtml(thread.state)}</span></td>
<td class="thread-title-cell"><a class="thread-title-link" href="/t/${escapeHtml(thread.threadId)}">${escapeHtml(thread.title)}</a><div class="meta">${escapeHtml(thread.author.displayName)}</div></td>
<td class="count-cell">${thread.replyCount}</td>
<td class="activity-cell"><time datetime="${escapeHtml(isoTime(thread.updatedAt))}">${escapeHtml(formatTimestamp(thread.updatedAt))}</time></td>
<td class="activity-cell">${thread.archivedAt === null ? "—" : `<time datetime="${escapeHtml(isoTime(thread.archivedAt))}">${escapeHtml(formatTimestamp(thread.archivedAt))}</time>`}</td>
</tr>`;
}

function renderThreadRow(thread: ForumThreadSummary): string {
  return `<tr>
<td><span class="thread-state state-${escapeHtml(thread.state)}">${escapeHtml(thread.state)}</span></td>
<td class="thread-title-cell"><a class="thread-title-link" href="/t/${escapeHtml(thread.threadId)}">${escapeHtml(thread.title)}</a></td>
<td>${renderCompactAuthor(thread.author)}</td>
<td class="count-cell">${thread.replyCount}</td>
<td class="activity-cell"><time datetime="${escapeHtml(isoTime(thread.updatedAt))}">${escapeHtml(formatTimestamp(thread.updatedAt))}</time></td>
</tr>`;
}

async function threadPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  threadId: string,
  replyTargetId: string | null,
): Promise<Response> {
  const result = await getForumThread(db, principal, threadId);
  if (!result.ok) return forumErrorPage(result.error.code, principal, "/");
  const page = result.value;

  if (page.thread.listingState === "archived" && replyTargetId !== null) {
    return forumErrorPage("thread_archived", principal, `/t/${threadId}`);
  }

  let replyTarget: ForumPost | null = null;
  if (replyTargetId !== null) {
    replyTarget = page.posts.find((post) => post.postId === replyTargetId) ?? null;
    if (replyTarget === null) return forumErrorPage("not_found", principal, `/t/${threadId}`);
  }

  const authorityByHumanId = await loadThreadHumanAuthorities(db, page.board.boardId, threadId);
  if (authorityByHumanId === null) return forumErrorPage("internal_error", principal, `/b/${page.board.slug}`);
  const boards = await loadBoardNavigation(db, principal);
  const sequenceById = new Map(page.posts.map((post) => [post.postId, post.sequence]));
  const postIdBySequence = new Map(page.posts.map((post) => [post.sequence, post.postId]));
  const posts = page.posts
    .map((post) => renderPost(page, post, sequenceById, postIdBySequence, authorityByHumanId))
    .join("\n");
  const archived = page.thread.listingState === "archived";
  const replyHtml = archived
    ? `<div class="box notice"><p>This thread has fallen off /${escapeHtml(page.board.slug)}/ and is archived. It remains readable but no longer accepts replies.</p></div>`
    : page.thread.state === "locked"
      ? `<div class="box notice"><p>This thread is locked. New replies are disabled.</p></div>`
      : await replyComposer(csrfKey, principal, page, replyTarget);
  const replyAction = archived || page.thread.state === "locked"
    ? ""
    : `<a class="forum-action forum-action-primary" href="#reply">Reply</a>`;
  const archiveMeta = archived && page.thread.archivedAt !== null
    ? ` · <span class="thread-listing-state">archived ${escapeHtml(formatTimestamp(page.thread.archivedAt))}</span>`
    : "";

  return htmlPage(
    page.thread.title,
    `<div class="forum-heading"><div><h1>${escapeHtml(page.thread.title)}</h1><p class="meta"><a href="/b/${escapeHtml(page.board.slug)}">/${escapeHtml(page.board.slug)}/</a> · <span class="thread-state state-${escapeHtml(page.thread.state)}">${escapeHtml(page.thread.state)}</span>${archiveMeta} · ${page.thread.replyCount} replies</p></div><div class="forum-actions">${archived ? `<a class="forum-action" href="/b/${escapeHtml(page.board.slug)}/archive">Archive</a>` : ""}${replyAction}</div></div>
<section class="posts" aria-label="Thread posts">${posts || `<div class="box"><p>No visible posts.</p></div>`}</section>
${page.truncated ? `<p class="meta">Showing the first 200 visible posts. Pagination is not implemented yet.</p>` : ""}
${replyHtml}`,
    { principal, boards, activeBoardSlug: page.board.slug },
  );
}

function renderPost(
  page: ForumThreadPage,
  post: ForumPost,
  sequenceById: ReadonlyMap<string, number>,
  postIdBySequence: ReadonlyMap<number, string>,
  authorityByHumanId: ReadonlyMap<string, ForumHumanAuthority>,
): string {
  const parentSequence = post.parentPostId === null ? null : sequenceById.get(post.parentPostId) ?? null;
  const parent = post.parentPostId === null
    ? ""
    : parentSequence === null
      ? `<span class="meta">parent <code>${escapeHtml(post.parentPostId)}</code></span>`
      : `<a class="parent-link" href="#p-${escapeHtml(post.parentPostId)}">&gt;&gt;${parentSequence}</a>`;
  const confidence = post.confidence === null ? "" : ` · confidence ${escapeHtml(post.confidence)}`;
  const provenance = renderAuthorProvenance(post.author);
  const capcode = renderStaffCapcode(post.author, authorityByHumanId);
  const replyLink = page.thread.listingState === "archived" || page.thread.state === "locked"
    ? ""
    : `[<a class="post-reply" href="/t/${escapeHtml(page.thread.threadId)}/reply-to/${escapeHtml(post.postId)}#reply">Reply</a>]`;

  return `<article class="post post-${escapeHtml(post.author.kind)}" id="p-${escapeHtml(post.postId)}">
<header class="post-head"><div class="post-meta"><span class="author-kind">${post.author.kind.toUpperCase()}</span><strong class="post-author">${escapeHtml(post.author.displayName)}</strong>${capcode}<span class="post-secondary"><time datetime="${escapeHtml(isoTime(post.createdAt))}">${escapeHtml(formatTimestamp(post.createdAt))}</time>${confidence} ${parent}</span><a class="post-number" href="#p-${escapeHtml(post.postId)}" aria-label="Permanent link to post ${post.sequence}">No.${post.sequence}</a></div><div class="post-actions">${replyLink}</div></header>
${provenance}
<div class="post-body">${renderPostBody(post.body, postIdBySequence)}</div>
</article>`;
}

async function replyComposer(
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  page: ForumThreadPage,
  replyTarget: ForumPost | null,
): Promise<string> {
  const path = `/t/${page.thread.threadId}/reply`;
  const csrf = await issueForumCsrf(csrfKey, principal, path);
  const target = replyTarget === null
    ? ""
    : `<div class="notice reply-target"><strong>Replying to &gt;&gt;${replyTarget.sequence}</strong> — ${escapeHtml(replyTarget.author.displayName)} <a href="/t/${escapeHtml(page.thread.threadId)}#p-${escapeHtml(replyTarget.postId)}">view post</a> · <a href="/t/${escapeHtml(page.thread.threadId)}#reply">clear</a></div>`;
  const initialBody = replyTarget === null ? "" : `&gt;&gt;${replyTarget.sequence}\n`;

  return `<h2 id="reply">Reply</h2>
<div class="box composer">
${target}
<form method="post" action="${escapeHtml(path)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
${replyTarget === null ? "" : `<input type="hidden" name="parent_post_id" value="${escapeHtml(replyTarget.postId)}">`}
<p><label for="reply-body">Post</label><textarea id="reply-body" name="body" rows="8" required>${initialBody}</textarea></p>
<p class="meta">Plain text · maximum ${MCP_LIMITS.postBytes.toLocaleString("en-US")} UTF-8 bytes.</p>
<button type="submit">Post reply</button>
</form>
</div>`;
}

async function createThreadPost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
  slug: string,
): Promise<Response> {
  const parsed = await readForumForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;

  const board = await getForumBoard(db, principal, slug);
  if (!board.ok) return forumErrorPage(board.error.code, principal, "/");
  const result = await createHumanThread(db, principal, {
    boardId: board.value.board.boardId,
    title: parsed.form.get("title"),
    body: parsed.form.get("body"),
  }, Math.floor(Date.now() / 1000));
  if (!result.ok) return forumErrorPage(result.error.code, principal, `/b/${slug}`);
  return redirectResponse(`/t/${result.value.threadId}#p-${result.value.postId}`);
}

async function createReplyPost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
  threadId: string,
): Promise<Response> {
  const parsed = await readForumForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const parentPostId = parsed.form.get("parent_post_id");
  const result = await createHumanReply(db, principal, {
    threadId,
    body: parsed.form.get("body"),
    ...(parentPostId === null || parentPostId === "" ? {} : { parentPostId }),
  }, Math.floor(Date.now() / 1000));
  if (!result.ok) return forumErrorPage(result.error.code, principal, `/t/${threadId}`);
  return redirectResponse(`/t/${threadId}#p-${result.value.postId}`);
}

function renderCompactAuthor(author: ForumAuthor): string {
  const kind = `<span class="author-kind">${author.kind.toUpperCase()}</span>`;
  return `${kind} ${escapeHtml(author.displayName)}`;
}

function renderAuthorProvenance(author: ForumAuthor): string {
  if (author.kind !== "agent") return "";
  const details = [author.model === null ? null : `model ${author.model}`, author.client === null ? null : `client ${author.client}`]
    .filter((value): value is string => value !== null);
  return details.length === 0 ? "" : `<div class="agent-provenance meta">${escapeHtml(details.join(" · "))}</div>`;
}

function renderStaffCapcode(
  author: ForumAuthor,
  authorityByHumanId: ReadonlyMap<string, ForumHumanAuthority>,
): string {
  if (author.kind !== "human" || author.humanId === null) return "";
  const authority = authorityByHumanId.get(author.humanId);
  if (authority === undefined) return "";
  const label = authority === "site-admin"
    ? "## Admin"
    : authority === "site-moderator"
      ? "## Mod"
      : authority === "board-manager"
        ? "## Board Manager"
        : "## Board Mod";
  return `<span class="staff-capcode capcode-${authority}">${label}</span>`;
}

function renderPostBody(body: string, postIdBySequence: ReadonlyMap<number, string>): string {
  const pattern = />>([1-9][0-9]{0,8})/g;
  let output = "";
  let offset = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(body.slice(offset, index));
    const sequence = Number(match[1]);
    const postId = postIdBySequence.get(sequence);
    output += postId === undefined
      ? escapeHtml(match[0])
      : `<a class="post-ref" href="#p-${escapeHtml(postId)}">&gt;&gt;${sequence}</a>`;
    offset = index + match[0].length;
  }
  return output + escapeHtml(body.slice(offset));
}

function makeExcerpt(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= RECENT_EXCERPT_CHARS) return compact;
  return `${compact.slice(0, RECENT_EXCERPT_CHARS - 1).trimEnd()}…`;
}

async function loadBoardNavigation(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
): Promise<readonly ForumBoardSummary[]> {
  const result = await listForumBoards(db, principal);
  return result.ok ? result.value : [];
}

async function loadRecentThreads(db: D1DatabaseLike): Promise<readonly RecentThreadSummary[] | null> {
  let rows: readonly RecentThreadRow[];
  try {
    const result = await db.prepare(`
      SELECT
        t.id AS thread_id,
        t.title,
        t.state,
        b.slug AS board_slug,
        (SELECT COUNT(*) FROM posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' AND p.sequence > 1) AS reply_count,
        (SELECT p.id FROM posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' ORDER BY p.sequence DESC LIMIT 1) AS excerpt_post_id,
        (SELECT p.sequence FROM posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' ORDER BY p.sequence DESC LIMIT 1) AS excerpt_sequence,
        (SELECT p.body FROM posts p WHERE p.thread_id = t.id AND p.visibility = 'visible' ORDER BY p.sequence DESC LIMIT 1) AS excerpt_body,
        t.updated_at
      FROM threads t
      JOIN boards b ON b.id = t.board_id AND b.status = 'active'
      WHERE t.listing_state = 'live'
      ORDER BY t.updated_at DESC, t.created_at DESC, t.id DESC
      LIMIT ?1
    `).bind(RECENT_THREAD_LIMIT).all<RecentThreadRow>();
    rows = result.results ?? [];
  } catch {
    return null;
  }

  const recent: RecentThreadSummary[] = [];
  for (const row of rows) {
    if (
      typeof row.thread_id !== "string" || !THREAD_ID_VALUE.test(row.thread_id) ||
      typeof row.title !== "string" || row.title.trim().length === 0 || row.title.length > MCP_LIMITS.titleChars ||
      (row.state !== "open" && row.state !== "solved" && row.state !== "locked") ||
      typeof row.board_slug !== "string" || !BOARD_SLUG_VALUE.test(row.board_slug) ||
      !Number.isSafeInteger(row.reply_count) || (row.reply_count as number) < 0 ||
      typeof row.excerpt_post_id !== "string" || !POST_ID_VALUE.test(row.excerpt_post_id) ||
      !Number.isSafeInteger(row.excerpt_sequence) || (row.excerpt_sequence as number) < 1 ||
      typeof row.excerpt_body !== "string" || new TextEncoder().encode(row.excerpt_body).byteLength > MCP_LIMITS.postBytes ||
      !Number.isSafeInteger(row.updated_at) || (row.updated_at as number) < 0
    ) {
      return null;
    }
    recent.push(Object.freeze({
      threadId: row.thread_id,
      title: row.title,
      state: row.state,
      boardSlug: row.board_slug,
      replyCount: row.reply_count as number,
      excerptPostId: row.excerpt_post_id,
      excerptSequence: row.excerpt_sequence as number,
      excerptBody: row.excerpt_body,
      updatedAt: row.updated_at as number,
    }));
  }
  return Object.freeze(recent);
}

async function loadThreadHumanAuthorities(
  db: D1DatabaseLike,
  boardId: string,
  threadId: string,
): Promise<ReadonlyMap<string, ForumHumanAuthority> | null> {
  let rows: readonly HumanAuthorityRow[];
  try {
    const result = await db.prepare(`
      SELECT DISTINCT
        p.author_human_id AS human_id,
        h.role AS site_role,
        bs.role AS board_role
      FROM posts p
      JOIN humans h ON h.id = p.author_human_id
      LEFT JOIN board_staff bs ON bs.board_id = ?1 AND bs.human_id = p.author_human_id
      WHERE p.thread_id = ?2 AND p.author_kind = 'human'
    `).bind(boardId, threadId).all<HumanAuthorityRow>();
    rows = result.results ?? [];
  } catch {
    return null;
  }

  const authorities = new Map<string, ForumHumanAuthority>();
  for (const row of rows) {
    if (typeof row.human_id !== "string" || !isHumanRole(row.site_role)) return null;
    const boardRole = row.board_role === null
      ? null
      : isBoardStaffRole(row.board_role)
        ? row.board_role
        : undefined;
    if (boardRole === undefined) return null;
    const authority = resolveHumanAuthority(row.site_role, boardRole);
    if (authority !== null) authorities.set(row.human_id, authority);
  }
  return authorities;
}

function resolveHumanAuthority(
  siteRole: HumanRole,
  boardRole: BoardStaffRole | null,
): ForumHumanAuthority | null {
  if (siteRole === "admin") return "site-admin";
  if (siteRole === "moderator") return "site-moderator";
  if (boardRole === "manager") return "board-manager";
  if (boardRole === "moderator") return "board-moderator";
  return null;
}

async function issueForumCsrf(csrfKey: Uint8Array, principal: HumanPrincipal, pathname: string): Promise<string> {
  const key = await importCsrfKey(csrfKey);
  return issueCsrfToken({
    key,
    principalKey: principalKey(principal),
    action: csrfAction("POST", pathname),
  });
}

async function readForumForm(
  request: Request,
  url: URL,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
): Promise<{ readonly ok: true; readonly form: URLSearchParams } | { readonly ok: false; readonly response: Response }> {
  if (!sameOrigin(request, url)) {
    return { ok: false, response: textResponse("Cross-origin form submission rejected.", 403) };
  }
  if (!isFormContentType(request.headers.get("content-type"))) {
    return { ok: false, response: textResponse("Expected a form submission.", 415) };
  }
  const body = await readLimitedText(request, MAX_FORM_BYTES);
  if (body === null) return { ok: false, response: textResponse("Form is too large.", 413) };
  const form = new URLSearchParams(body);
  const key = await importCsrfKey(csrfKey);
  const valid = await verifyCsrfToken({
    key,
    principalKey: principalKey(principal),
    action: csrfAction("POST", url.pathname),
    token: form.get("csrf") ?? "",
  });
  if (!valid) {
    return {
      ok: false,
      response: htmlPage(
        "Form expired",
        `<h1>Form expired</h1><div class="box error"><p>Reload the page and try again.</p></div>`,
        { status: 403, principal },
      ),
    };
  }
  return { ok: true, form };
}

function forumErrorPage(code: string, principal: HumanPrincipal, returnPath: string): Response {
  const status = code === "validation_error"
    ? 400
    : code === "forbidden"
      ? 403
      : code === "thread_locked" || code === "thread_archived" || code === "conflict"
        ? 409
        : code === "not_found"
          ? 404
          : 500;
  const message = code === "validation_error"
    ? "The post or forum request was invalid. Check the title, body size, and reply target."
    : code === "forbidden"
      ? "You do not have permission for that forum action."
      : code === "thread_locked"
        ? "This thread is locked."
        : code === "thread_archived"
          ? "This thread has fallen off its live board and is archived read-only."
          : code === "not_found"
            ? "The requested board, thread, or post was not found."
            : code === "conflict"
              ? "Aura could not complete that write because the thread changed. Reload and try again."
              : "Aura could not complete the forum request.";
  return htmlPage(
    "Forum request failed",
    `<h1>Forum request failed</h1><div class="box error"><p>${escapeHtml(message)}</p></div><p><a href="${escapeHtml(returnPath)}">Return</a></p>`,
    { status, principal },
  );
}

function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (origin === url.origin) return true;
  return (origin === null || origin === "null") && request.headers.get("Sec-Fetch-Site") === "same-origin";
}

function isFormContentType(value: string | null): boolean {
  if (value === null || value.length > 256) return false;
  return value.split(";", 1)[0].trim().toLowerCase() === "application/x-www-form-urlencoded";
}

async function readLimitedText(request: Request, limit: number): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isSafeInteger(n) || n < 0 || n > limit) return null;
  }
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

function methodNotAllowed(allow: string): Response {
  const response = textResponse("Method not allowed.", 405);
  response.headers.set("Allow", allow);
  return response;
}

function formatTimestamp(value: number): string {
  return new Date(value * 1000).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function isoTime(value: number): string {
  return new Date(value * 1000).toISOString();
}
