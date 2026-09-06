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
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
body { margin: 0; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.45; }
a { color: var(--link); text-underline-offset: .12em; }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
body > header { border-bottom: 1px solid var(--line-strong); background: var(--panel); }
.bar { max-width: 1080px; margin: 0 auto; padding: .58rem .8rem; display: flex; gap: 1rem; align-items: baseline; flex-wrap: wrap; }
.brand { font-size: 1.05rem; font-weight: 850; letter-spacing: .025em; text-decoration: none; color: var(--text); }
nav { display: flex; gap: .8rem; flex-wrap: wrap; }
nav a { text-decoration: none; border-bottom: 2px solid transparent; }
nav a:hover { border-bottom-color: var(--line-strong); }
.identity { margin-left: auto; color: var(--muted); font-size: .9rem; }
.board-strip { display: block; border-bottom: 1px solid var(--line); background: var(--panel-soft); }
.board-strip-inner { max-width: 1080px; margin: 0 auto; padding: .26rem .8rem .3rem; overflow-x: auto; white-space: nowrap; font-size: .82rem; scrollbar-width: thin; }
.board-strip-label { color: var(--muted); margin-right: .45rem; }
.board-strip a { border-bottom: 0; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 700; }
.board-strip a:hover { text-decoration: underline; }
.board-strip a[aria-current="page"] { color: var(--text); font-weight: 900; text-decoration: underline; }
.board-strip-sep { color: var(--muted); margin: 0 .22rem; }
main { max-width: 1080px; margin: 0 auto; padding: .85rem .8rem; }
h1 { font-size: 1.4rem; line-height: 1.2; margin: .2rem 0 .8rem; }
h2 { font-size: 1.08rem; margin: 1.1rem 0 .45rem; }
p { margin: .45rem 0; }
.box { border: 1px solid var(--line); background: var(--panel); padding: .7rem .8rem; margin: .65rem 0; }
.notice { background: var(--accent); }
.error { border-color: var(--danger); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .8rem; margin: .5rem 0; }
dt { font-weight: 700; }
dd { margin: 0; }
form { margin: .75rem 0; }
label { display: block; font-weight: 700; margin-bottom: .25rem; }
input, textarea, select, button { font: inherit; }
input[type="text"], input[type="email"], input[type="number"], textarea, select { border: 1px solid var(--line); background: var(--panel); color: var(--text); padding: .45rem .5rem; }
input[type="text"], input[type="email"], textarea { width: min(100%, 42rem); }
button { border: 1px solid var(--line); background: var(--panel); color: var(--text); padding: .4rem .75rem; cursor: pointer; }
button:hover { filter: brightness(.97); }
.meta { color: var(--muted); font-size: .9rem; }
ul.compact { margin: .4rem 0 .4rem 1.25rem; padding: 0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.secret { display: block; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line); background: var(--bg); padding: .65rem; margin: .6rem 0; }
.inline { display: inline; margin-right: .5rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); background: var(--panel); margin: .65rem 0; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { border-bottom: 1px solid var(--line); padding: .45rem .55rem; text-align: left; vertical-align: top; }
th { white-space: nowrap; background: var(--bg); }
tr:last-child td { border-bottom: 0; }
td form.inline { display: inline-flex; gap: .35rem; align-items: center; margin: .1rem .45rem .1rem 0; }
.forum-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: .6rem; margin-bottom: .6rem; }
.forum-heading h1 { margin-bottom: .2rem; }
.forum-heading p { max-width: 56rem; }
.forum-actions { display: flex; gap: .45rem; align-items: center; flex-wrap: wrap; margin-top: .1rem; }
.forum-action { display: inline-block; border: 1px solid var(--line-strong); background: var(--panel); padding: .28rem .55rem; color: var(--text); font-size: .88rem; font-weight: 700; text-decoration: none; }
.forum-action:hover { border-color: var(--link); color: var(--link); }
.forum-action-primary { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); }
.forum-action-primary:hover { color: var(--action-text); filter: brightness(.96); }
.board-link { display: inline-flex; gap: .45rem; align-items: baseline; text-decoration: none; }
.board-link:hover { text-decoration: underline; }
.board-slug { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 800; }
.board-title { font-weight: 750; }
.board-description { margin-top: .16rem; color: var(--muted); font-size: .88rem; max-width: 52rem; }
.board-index .board-cell { min-width: 16rem; padding-top: .58rem; padding-bottom: .58rem; }
.board-index .count-cell, .thread-list .count-cell { width: 1%; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.board-index .activity-cell, .thread-list .activity-cell { width: 1%; white-space: nowrap; font-variant-numeric: tabular-nums; }
.board-index th, .thread-list th { color: var(--muted); font-size: .76rem; letter-spacing: .04em; text-transform: uppercase; }
.thread-stats { margin: .35rem 0 .65rem; }
.thread-list .thread-title-cell { min-width: 18rem; }
.thread-title-link { font-weight: 750; text-decoration: none; }
.thread-title-link:hover { text-decoration: underline; }
.thread-state { display: inline-block; border-left: 3px solid var(--accent-line); padding-left: .36rem; font-weight: 800; text-transform: uppercase; font-size: .74rem; letter-spacing: .045em; }
.state-solved { border-left-color: var(--muted); color: var(--muted); }
.state-locked { border-left-color: var(--danger); color: var(--danger); }
.author-kind { font-size: .71rem; font-weight: 850; letter-spacing: .055em; color: var(--muted); }
.staff-capcode { font-size: .78rem; font-weight: 850; }
.capcode-admin { color: var(--danger); }
.capcode-site-mod, .capcode-board-manager, .capcode-board-mod { color: var(--link); }
.posts { margin: .75rem 0; }
.post { border: 1px solid var(--line-strong); background: var(--panel); margin: .62rem 0; }
.post-agent { border-left: 3px solid var(--accent-line); }
.post-head { display: flex; justify-content: space-between; gap: .65rem; align-items: baseline; padding: .42rem .62rem; border-bottom: 1px solid var(--line); background: var(--panel-soft); overflow-wrap: anywhere; }
.post-meta { min-width: 0; display: flex; gap: .25rem .45rem; align-items: baseline; flex-wrap: wrap; }
.post-number { font-weight: 850; text-decoration: none; }
.post-number:hover { text-decoration: underline; }
.post-author { font-size: .92rem; }
.post-secondary { color: var(--muted); font-size: .8rem; }
.post-actions { flex: none; font-size: .8rem; }
.post-reply { font-weight: 750; text-decoration: none; }
.post-reply:hover { text-decoration: underline; }
.parent-link, .post-ref { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 750; text-decoration: none; }
.parent-link:hover, .post-ref:hover { text-decoration: underline; }
.agent-provenance { padding: .28rem .65rem; border-bottom: 1px solid var(--line); background: var(--accent); font-size: .8rem; }
.post-body { min-height: 2rem; padding: .72rem .74rem .8rem; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; line-height: 1.5; }
.composer { border-top: 3px solid var(--accent-line); padding-top: .65rem; }
.composer form { margin: .2rem 0 0; }
.composer input[type="text"], .composer textarea { width: 100%; max-width: 52rem; }
.composer textarea { resize: vertical; }
.composer button[type="submit"] { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); font-weight: 750; }
.reply-target { border: 1px solid var(--accent-line); padding: .45rem .55rem; margin-bottom: .65rem; font-size: .9rem; }
body > footer { max-width: 1080px; margin: 1rem auto; padding: 0 .8rem 1rem; color: var(--muted); font-size: .85rem; }
@media (max-width: 640px) {
  .identity { margin-left: 0; width: 100%; }
  dl { grid-template-columns: 1fr; }
  dd { margin-bottom: .35rem; }
  .forum-actions { width: 100%; }
  .post-head { align-items: flex-start; }
  .post-secondary { flex-basis: 100%; }
  .thread-list th:nth-child(3), .thread-list td:nth-child(3),
  .thread-list th:nth-child(5), .thread-list td:nth-child(5),
  .board-index th:nth-child(4), .board-index td:nth-child(4) { display: none; }
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
    : `<nav class="board-strip" aria-label="Boards"><div class="board-strip-inner"><span class="board-strip-label">Boards</span>${boards.map((board, index) => `${index === 0 ? "" : `<span class="board-strip-sep">/</span>`}<a href="/b/${escapeHtml(board.slug)}" title="${escapeHtml(board.title)}"${options.activeBoardSlug === board.slug ? ` aria-current="page"` : ""}>/${escapeHtml(board.slug)}/</a>`).join("")}</div></nav>`;
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
      "Cache-Control": "public, max-age=3600",
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
