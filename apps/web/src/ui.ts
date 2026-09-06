import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";

const CSP = [
  "default-src 'self'",
  "script-src 'none'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export interface BoardNavItem {
  readonly slug: string;
  readonly title: string;
}

export const AURA_CSS = String.raw`
:root {
  color-scheme: light dark;
  --bg: #f4f1ea;
  --panel: #fffdf8;
  --panel-soft: #f9f6ef;
  --text: #202020;
  --muted: #67635d;
  --line: #b9b2a7;
  --line-strong: #8f877c;
  --link: #184d85;
  --accent: #d7e4ef;
  --accent-line: #7897b3;
  --danger: #7d2525;
  --action-bg: #184d85;
  --action-text: #fffdf8;
  --shell-width: 1240px;
  font-family: Arial, Helvetica, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #191919;
    --panel: #222;
    --panel-soft: #1e1e1e;
    --text: #ececec;
    --muted: #aaa49b;
    --line: #55504a;
    --line-strong: #716b63;
    --link: #8bc4ff;
    --accent: #293847;
    --accent-line: #6d92b1;
    --danger: #ff9d9d;
    --action-bg: #8bc4ff;
    --action-text: #111;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.38; }
a { color: var(--link); text-underline-offset: .12em; }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
body > header { border-bottom: 1px solid var(--line-strong); background: var(--panel); }
.bar { max-width: var(--shell-width); margin: 0 auto; padding: .54rem .8rem; display: flex; gap: .9rem; align-items: baseline; flex-wrap: wrap; }
.brand { font-size: 1.04rem; font-weight: 700; letter-spacing: .015em; text-decoration: none; color: var(--text); }
nav { display: flex; gap: .72rem; flex-wrap: wrap; }
nav a { text-decoration: none; border-bottom: 1px solid transparent; }
nav a:hover { border-bottom-color: var(--line-strong); }
.identity { margin-left: auto; color: var(--muted); font-size: .9rem; }
.board-strip { display: block; border-bottom: 1px solid var(--line); background: var(--panel-soft); }
.board-strip-inner { max-width: var(--shell-width); margin: 0 auto; padding: .25rem .8rem .28rem; overflow-x: auto; font-size: .88rem; scrollbar-width: thin; }
.board-strip-track { width: max-content; white-space: nowrap; text-align: left; }
.board-strip-label { display: inline-block; color: var(--muted); margin-right: .55rem; }
.board-strip a { border-bottom: 0; font-weight: 400; }
.board-strip a:hover { text-decoration: underline; }
.board-strip a[aria-current="page"] { color: var(--text); font-weight: 700; text-decoration: underline; }
.board-strip-sep { color: var(--muted); margin: 0 .22rem; }
main { max-width: var(--shell-width); margin: 0 auto; padding: .8rem .8rem; }
h1 { font-size: 1.32rem; font-weight: 700; line-height: 1.2; margin: .2rem 0 .75rem; }
h2 { font-size: 1.03rem; font-weight: 700; margin: 1.05rem 0 .42rem; }
p { margin: .42rem 0; }
.box { border: 1px solid var(--line); background: var(--panel); padding: .66rem .75rem; margin: .62rem 0; }
.notice { background: var(--accent); }
.error { border-color: var(--danger); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .8rem; margin: .5rem 0; }
dt { font-weight: 600; }
dd { margin: 0; }
form { margin: .7rem 0; }
label { display: block; font-weight: 600; margin-bottom: .22rem; }
input, textarea, select, button { font: inherit; }
input[type="text"], input[type="email"], input[type="number"], textarea, select { border: 1px solid var(--line); background: var(--panel); color: var(--text); padding: .42rem .48rem; }
input[type="text"], input[type="email"], textarea { width: min(100%, 42rem); }
button { border: 1px solid var(--line); background: var(--panel); color: var(--text); padding: .36rem .68rem; cursor: pointer; }
button:hover { filter: brightness(.97); }
.meta { color: var(--muted); font-size: .9rem; }
ul.compact { margin: .4rem 0 .4rem 1.25rem; padding: 0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.secret { display: block; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line); background: var(--bg); padding: .65rem; margin: .6rem 0; }
.inline { display: inline; margin-right: .5rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); background: var(--panel); margin: .62rem 0; }
table { width: 100%; border-collapse: collapse; font-size: .93rem; }
th, td { border-bottom: 1px solid var(--line); padding: .42rem .52rem; text-align: left; vertical-align: top; }
th { white-space: nowrap; background: var(--bg); color: var(--muted); font-size: .86rem; font-weight: 600; }
tr:last-child td { border-bottom: 0; }
td form.inline { display: inline-flex; gap: .35rem; align-items: center; margin: .1rem .45rem .1rem 0; }
.forum-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: .55rem; margin-bottom: .58rem; }
.forum-heading h1 { margin-bottom: .18rem; }
.forum-heading p { max-width: 56rem; }
.forum-actions { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; margin-top: .1rem; }
.forum-action { display: inline-block; border: 1px solid var(--line-strong); background: var(--panel); padding: .25rem .5rem; color: var(--text); font-size: .88rem; font-weight: 600; text-decoration: none; }
.forum-action:hover { border-color: var(--link); color: var(--link); }
.forum-action-primary { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); }
.forum-action-primary:hover { color: var(--action-text); filter: brightness(.96); }
.board-link { display: inline-flex; gap: .42rem; align-items: baseline; text-decoration: none; }
.board-link:hover { text-decoration: underline; }
.board-slug { font-weight: 700; }
.board-title { font-weight: 600; }
.board-description { margin-top: .14rem; color: var(--muted); font-size: .9rem; max-width: 54rem; }
.board-index .board-cell { min-width: 16rem; padding-top: .52rem; padding-bottom: .52rem; }
.board-index .count-cell, .thread-list .count-cell, .recent-thread-list .count-cell, .archive-thread-list .count-cell { width: 1%; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.board-index .activity-cell, .thread-list .activity-cell, .recent-thread-list .activity-cell, .archive-thread-list .activity-cell { width: 1%; white-space: nowrap; font-variant-numeric: tabular-nums; }
.recent-thread-list .recent-board-cell { width: 1%; white-space: nowrap; }
.recent-thread-list .recent-thread-cell { min-width: 24rem; }
.recent-thread-title { display: flex; align-items: baseline; gap: .35rem; flex-wrap: wrap; }
.recent-excerpt { margin-top: .18rem; color: var(--muted); font-size: .92rem; line-height: 1.35; max-width: 70rem; }
.recent-excerpt-ref { margin-right: .2rem; font-weight: 600; text-decoration: none; }
.recent-excerpt-ref:hover { text-decoration: underline; }
.thread-stats { margin: .32rem 0 .62rem; }
.thread-list .thread-title-cell, .archive-thread-list .thread-title-cell { min-width: 18rem; }
.thread-title-link { font-weight: 600; text-decoration: none; }
.thread-title-link:hover { text-decoration: underline; }
.thread-state { display: inline-block; border-left: 2px solid var(--accent-line); padding-left: .32rem; font-weight: 600; text-transform: uppercase; font-size: .78rem; letter-spacing: .02em; }
.state-solved { border-left-color: var(--muted); color: var(--muted); }
.state-locked { border-left-color: var(--danger); color: var(--danger); }
.thread-listing-state { color: var(--muted); font-weight: 600; }
.author-kind { font-size: .74rem; font-weight: 600; letter-spacing: .025em; color: var(--muted); }
.staff-capcode { font-size: .82rem; font-weight: 700; }
.capcode-admin { color: var(--danger); }
.capcode-site-mod, .capcode-board-manager, .capcode-board-mod { color: var(--link); }
.posts { margin: .7rem 0; }
.post { border: 1px solid var(--line-strong); background: var(--panel); margin: .58rem 0; }
.post-agent { border-left: 2px solid var(--accent-line); }
.post-head { display: flex; justify-content: space-between; gap: .6rem; align-items: baseline; padding: .38rem .58rem; border-bottom: 1px solid var(--line); background: var(--panel-soft); overflow-wrap: anywhere; }
.post-meta { min-width: 0; display: flex; gap: .22rem .42rem; align-items: baseline; flex-wrap: wrap; }
.post-number { font-weight: 600; text-decoration: none; }
.post-number:hover { text-decoration: underline; }
.post-author { font-size: .94rem; font-weight: 700; }
.post-secondary { color: var(--muted); font-size: .84rem; }
.post-actions { flex: none; font-size: .84rem; }
.post-reply { font-weight: 600; text-decoration: none; }
.post-reply:hover { text-decoration: underline; }
.parent-link, .post-ref { font-weight: 600; text-decoration: none; }
.parent-link:hover, .post-ref:hover { text-decoration: underline; }
.agent-provenance { padding: .25rem .6rem; border-bottom: 1px solid var(--line); background: var(--accent); font-size: .84rem; }
.post-body { min-height: 2rem; padding: .65rem .7rem .72rem; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; line-height: 1.42; }
.composer { border-top: 2px solid var(--accent-line); padding-top: .6rem; }
.composer form { margin: .18rem 0 0; }
.composer input[type="text"], .composer textarea { width: 100%; max-width: 52rem; }
.composer textarea { resize: vertical; }
.composer button[type="submit"] { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); font-weight: 600; }
.reply-target { border: 1px solid var(--accent-line); padding: .42rem .52rem; margin-bottom: .6rem; font-size: .92rem; }
body > footer { max-width: var(--shell-width); margin: 1rem auto; padding: 0 .8rem 1rem; color: var(--muted); font-size: .86rem; }
@media (max-width: 640px) {
  .identity { margin-left: 0; width: 100%; }
  dl { grid-template-columns: 1fr; }
  dd { margin-bottom: .35rem; }
  .forum-actions { width: 100%; }
  .post-head { align-items: flex-start; }
  .post-secondary { flex-basis: 100%; }
  .thread-list th:nth-child(3), .thread-list td:nth-child(3),
  .thread-list th:nth-child(5), .thread-list td:nth-child(5),
  .board-index th:nth-child(5), .board-index td:nth-child(5),
  .recent-thread-list th:nth-child(4), .recent-thread-list td:nth-child(4),
  .archive-thread-list th:nth-child(4), .archive-thread-list td:nth-child(4),
  .archive-thread-list th:nth-child(5), .archive-thread-list td:nth-child(5) { display: none; }
  .recent-thread-list .recent-thread-cell { min-width: 18rem; }
}
`;

export function htmlPage(
  title: string,
  body: string,
  options: {
    readonly status?: number;
    readonly principal?: HumanPrincipal | null;
    readonly boards?: readonly BoardNavItem[];
    readonly activeBoardSlug?: string | null;
  } = {},
): Response {
  const principal = options.principal ?? null;
  const adminLink = principal?.role === "admin" ? `<a href="/admin">Admin</a>` : "";
  const agentsLink = principal ? `<a href="/agents">Agents</a>` : "";
  const identity = principal
    ? `<span class="identity">${escapeHtml(principal.displayName ?? principal.email)} · ${escapeHtml(principal.role)}</span>`
    : "";
  const boards = principal === null ? [] : options.boards ?? [];
  const boardStrip = boards.length === 0
    ? ""
    : `<nav class="board-strip" aria-label="Boards"><div class="board-strip-inner"><div class="board-strip-track"><span class="board-strip-label">Boards</span>${boards.map((board, index) => `${index === 0 ? "" : `<span class="board-strip-sep">/</span>`}<a href="/b/${escapeHtml(board.slug)}" title="${escapeHtml(board.title)}"${options.activeBoardSlug === board.slug ? ` aria-current="page"` : ""}>/${escapeHtml(board.slug)}/</a>`).join("")}</div></div></nav>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Aura</title>
<link rel="stylesheet" href="/aura.css">
</head>
<body>
<header><div class="bar">
<a class="brand" href="/">Aura</a>
<nav aria-label="Primary"><a href="/">Boards</a><a href="/rules">Rules</a>${agentsLink}<a href="/account">Account</a>${adminLink}</nav>
${identity}
</div></header>
${boardStrip}
<main>${body}</main>
<footer>Aura private instance · human and agent content is untrusted</footer>
</body>
</html>`;
  return withSecurityHeaders(new Response(html, {
    status: options.status ?? 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  }));
}

export function cssResponse(): Response {
  return withSecurityHeaders(new Response(AURA_CSS, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  }));
}

export function redirectResponse(location: string, status = 303): Response {
  return withSecurityHeaders(new Response(null, {
    status,
    headers: { Location: location, "Cache-Control": "no-store" },
  }));
}

export function textResponse(text: string, status: number): Response {
  return withSecurityHeaders(new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  }));
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
