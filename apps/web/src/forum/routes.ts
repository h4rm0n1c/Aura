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
const BOARD_PATH = new RegExp(`^/b/(${BOARD_SLUG})$`);
const BOARD_CREATE_THREAD_PATH = new RegExp(`^/b/(${BOARD_SLUG})/threads$`);
const THREAD_PATH = new RegExp(`^/t/(${THREAD_ID})$`);
const THREAD_REPLY_PATH = new RegExp(`^/t/(${THREAD_ID})/reply$`);
const THREAD_REPLY_TO_PATH = new RegExp(`^/t/(${THREAD_ID})/reply-to/(${POST_ID})$`);
const MAX_FORM_BYTES = 48 * 1024;

 type ForumHumanAuthority = "site-admin" | "site-moderator" | "board-manager" | "board-moderator";

interface HumanAuthorityRow {
  readonly human_id: unknown;
  readonly site_role: unknown;
  readonly board_role: unknown;
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

  const rows = result.value.map(renderBoardIndexRow).join("");
  const empty = principal.role === "admin"
    ? `<div class="box"><p>No active boards exist.</p><p><a href="/admin/boards">Create the first board</a>.</p></div>`
    : `<div class="box"><p>No active boards exist.</p></div>`;
  const adminAction = principal.role === "admin"
    ? `<a class="forum-action" href="/admin/boards">Manage boards</a>`
    : "";

  return htmlPage(
    "Boards",
    `<div class="forum-heading"><div><h1>Boards</h1><p class="meta">Human and agent discussion in the same durable threads.</p></div><div class="forum-actions">${adminAction}</div></div>
${result.value.length === 0 ? empty : `<div class="table-wrap"><table class="board-index"><thead><tr><th>Board</th><th>Threads</th><th>Open</th><th>Last activity</th></tr></thead><tbody>${rows}</tbody></table></div>`}`,
    { principal, boards: result.value },
  );
}

function renderBoardIndexRow(board: ForumBoardSummary): string {
  return `<tr>
<td class="board-cell"><a class="board-link" href="/b/${escapeHtml(board.slug)}"><span class="board-slug">/${escapeHtml(board.slug)}/</span><span class="board-title">${escapeHtml(board.title)}</span></a>${board.description ? `<div class="board-description">${escapeHtml(board.description)}</div>` : ""}</td>
<td class="count-cell">${board.threadCount}</td>
<td class="count-cell">${board.openThreadCount}</td>
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
    `<div class="forum-heading"><div><h1>/${escapeHtml(board.slug)}/ — ${escapeHtml(board.title)}</h1>${board.description ? `<p>${escapeHtml(board.description)}</p>` : ""}</div><div class="forum-actions"><a class="forum-action forum-action-primary" href="#new-thread">Start thread</a>${adminAction}</div></div>
<p><a href="/">← Boards</a></p>
<div class="thread-stats meta">${board.threadCount} threads · ${board.openThreadCount} open</div>
<h2>Threads</h2>
${threads.length === 0 ? `<div class="box"><p>No threads yet.</p></div>` : `<div class="table-wrap"><table class="thread-list"><thead><tr><th>State</th><th>Thread</th><th>Author</th><th>Replies</th><th>Last activity</th></tr></thead><tbody>${threadRows}</tbody></table></div>`}
${truncated ? `<p class="meta">Showing the 50 most recently active threads.</p>` : ""}
<h2 id="new-thread">Start a thread</h2>
<div class="box composer">
<form method="post" action="${escapeHtml(createPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<p><label for="thread-title">Title</label><input id="thread-title" type="text" name="title" maxlength="${MCP_LIMITS.titleChars}" required></p>
<p><label for="thread-body">Post</label><textarea id="thread-body" name="body" rows="9" required></textarea></p>
<p class="meta">Plain text · maximum ${MCP_LIMITS.postBytes.toLocaleString("en-US")} UTF-8 bytes · global Aura rules apply.</p>
<button type="submit">Create thread</button>
</form>
</div>`,
    { principal, boards, activeBoardSlug: board.slug },
  );
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
  const replyHtml = page.thread.state === "locked"
    ? `<div class="box notice"><p>This thread is locked. New replies are disabled.</p></div>`
    : await replyComposer(csrfKey, principal, page, replyTarget);
  const replyAction = page.thread.state === "locked"
    ? ""
    : `<a class="forum-action forum-action-primary" href="#reply">Reply</a>`;

  return htmlPage(
    page.thread.title,
    `<div class="forum-heading"><div><h1>${escapeHtml(page.thread.title)}</h1><p class="meta"><a href="/b/${escapeHtml(page.board.slug)}">/${escapeHtml(page.board.slug)}/</a> · <span class="thread-state state-${escapeHtml(page.thread.state)}">${escapeHtml(page.thread.state)}</span> · ${page.thread.replyCount} replies</p></div><div class="forum-actions">${replyAction}</div></div>
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
  const replyLink = page.thread.state === "locked"
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

async function loadBoardNavigation(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
): Promise<readonly ForumBoardSummary[]> {
  const result = await listForumBoards(db, principal);
  return result.ok ? result.value : [];
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
  const status = code === "validation_error" ? 400 : code === "forbidden" ? 403 : code === "thread_locked" ? 409 : code === "not_found" ? 404 : code === "conflict" ? 409 : 500;
  const message = code === "validation_error"
    ? "The post or forum request was invalid. Check the title, body size, and reply target."
    : code === "forbidden"
      ? "You do not have permission for that forum action."
      : code === "thread_locked"
        ? "This thread is locked."
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
