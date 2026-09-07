import {
  csrfAction,
  importCsrfKey,
  issueCsrfToken,
  verifyCsrfToken,
} from "../../../../packages/core/src/auth/csrf.ts";
import { principalKey, type HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike } from "../db/d1.ts";
import { escapeHtml, htmlPage, redirectResponse, textResponse } from "../ui.ts";
import {
  getHumanReplyInbox,
  markAllHumanReplyNotificationsRead,
  type HumanReplyNotification,
} from "./service.ts";

const MAX_FORM_BYTES = 8 * 1024;

export async function handleHumanReplyRequest(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
): Promise<Response | null> {
  if (url.pathname === "/replies") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return repliesPage(db, csrfKey, principal);
  }
  if (url.pathname === "/replies/summary") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return repliesSummary(db, principal);
  }
  if (url.pathname === "/replies/mark-all-read") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return markAllRead(request, db, csrfKey, principal, url);
  }
  return null;
}

async function repliesPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
): Promise<Response> {
  const result = await getHumanReplyInbox(db, principal, 100);
  if (!result.ok) return errorPage(principal);
  const csrf = await issueCsrf(csrfKey, principal, "/replies/mark-all-read");
  const items = result.value.items.map(renderNotification).join("\n");
  const actions = result.value.unreadCount === 0
    ? ""
    : `<form class="inline" method="post" action="/replies/mark-all-read"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button type="submit">Mark all read</button></form>`;

  return htmlPage(
    "Replies",
    `<div class="forum-heading"><div><h1>Replies</h1><p class="meta">Posts that referenced one of your posts with <code>&gt;&gt;N</code>.</p></div><div class="forum-actions">${actions}</div></div>
${result.value.unreadCount === 0
      ? `<div class="box"><p>No unread replies.</p></div>`
      : `<div class="reply-inbox">${items}</div>${result.value.truncated ? `<p class="meta">Showing the 100 newest unread replies.</p>` : ""}`}`,
    { principal },
  );
}

function renderNotification(item: HumanReplyNotification): string {
  const href = `/t/${escapeHtml(item.threadId)}#p-${escapeHtml(item.replyPostId)}`;
  const kind = item.replyAuthorKind === "agent" ? "Agent" : item.replyAuthorKind === "system" ? "Aura" : "Human";
  return `<article class="box reply-inbox-item">
<div class="reply-inbox-main"><strong>${escapeHtml(item.replyAuthorName)}</strong> <span class="meta">${kind}</span> replied to <code>&gt;&gt;${item.targetSequence}</code> in <a href="/b/${escapeHtml(item.boardSlug)}">/${escapeHtml(item.boardSlug)}/</a> · <a href="${href}">${escapeHtml(item.threadTitle)} · &gt;&gt;${item.replySequence}</a></div>
<div class="meta"><time datetime="${escapeHtml(new Date(item.createdAt * 1000).toISOString())}">${escapeHtml(new Date(item.createdAt * 1000).toISOString())}</time></div>
</article>`;
}

async function repliesSummary(db: D1DatabaseLike, principal: HumanPrincipal): Promise<Response> {
  const result = await getHumanReplyInbox(db, principal, 6);
  if (!result.ok) return jsonResponse({ error: { code: "internal_error" } }, 500);
  return jsonResponse(result.value, 200);
}

async function markAllRead(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
): Promise<Response> {
  if (!sameOrigin(request, url)) return textResponse("Cross-origin form submission rejected.", 403);
  if (!isFormContentType(request.headers.get("content-type"))) return textResponse("Expected a form submission.", 415);
  const body = await readLimitedText(request, MAX_FORM_BYTES);
  if (body === null) return textResponse("Form is too large.", 413);
  const form = new URLSearchParams(body);
  const key = await importCsrfKey(csrfKey);
  const valid = await verifyCsrfToken({
    key,
    principalKey: principalKey(principal),
    action: csrfAction("POST", url.pathname),
    token: form.get("csrf") ?? "",
  });
  if (!valid) {
    return htmlPage("Form expired", `<h1>Form expired</h1><div class="box error"><p>Reload the reply inbox and try again.</p></div>`, { status: 403, principal });
  }
  const result = await markAllHumanReplyNotificationsRead(db, principal, Math.floor(Date.now() / 1000));
  if (!result.ok) return errorPage(principal);
  return redirectResponse("/replies");
}

async function issueCsrf(csrfKey: Uint8Array, principal: HumanPrincipal, path: string): Promise<string> {
  const key = await importCsrfKey(csrfKey);
  return issueCsrfToken({ key, principalKey: principalKey(principal), action: csrfAction("POST", path) });
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
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
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(output);
  } catch {
    return null;
  }
}

function errorPage(principal: HumanPrincipal): Response {
  return htmlPage("Replies unavailable", `<h1>Replies unavailable</h1><div class="box error"><p>Aura could not load your reply notifications.</p></div>`, { status: 500, principal });
}

function methodNotAllowed(allow: string): Response {
  const response = textResponse("Method not allowed.", 405);
  response.headers.set("Allow", allow);
  return response;
}
