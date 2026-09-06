import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";
import { AURA_MARK_INLINE } from "./brand.ts";

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
  color-scheme: dark;
  --bg: #000;
  --panel: #151515;
  --panel-soft: #1e1e1e;
  --field: #101010;
  --text: #fff;
  --muted: #c8c8c8;
  --line: #626262;
  --line-strong: #8a8a8a;
  --link: #82c8ff;
  --accent: #1c2407;
  --accent-line: #dffb48;
  --danger: #ff9292;
  --action-bg: #fff;
  --action-text: #000;
  --shell-width: 80vw;
  font-family: Arial, Helvetica, sans-serif;
}
html { font-size: 150%; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-size: 1rem; line-height: 1.5; }
body > header, .board-strip, main, body > footer { font-size: 1rem; line-height: 1.5; }
a { color: var(--link); text-underline-offset: .12em; }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
body > header { border-bottom: 1px solid var(--line-strong); background: #000; }
.bar { max-width: var(--shell-width); margin: 0 auto; padding: .48rem .8rem; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.brand { display: inline-flex; align-items: center; gap: .52rem; flex: none; font-weight: 600; text-decoration: none; color: var(--text); }
.brand:hover .brand-word { text-decoration: underline; }
.brand-mark { display: block; width: 3rem; height: 2.38rem; flex: none; border-radius: 2px; }
.brand-word { font-size: 1.12rem; letter-spacing: .01em; }
nav { display: flex; gap: .8rem; flex-wrap: wrap; }
nav a { text-decoration: none; border-bottom: 1px solid transparent; }
nav a:hover { border-bottom-color: var(--line-strong); }
.identity { margin-left: auto; color: var(--muted); font-size: .95rem; }
.board-strip { display: block; border-bottom: 1px solid var(--line); background: #0a0a0a; }
.board-strip-inner { max-width: var(--shell-width); margin: 0 auto; padding: .3rem .8rem .32rem; overflow-x: auto; font-size: .95rem; scrollbar-width: thin; }
.board-strip-track { width: max-content; white-space: nowrap; text-align: left; }
.board-strip-label { display: inline-block; color: var(--muted); margin-right: .6rem; }
.board-strip a { border-bottom: 0; font-weight: 400; }
.board-strip a:hover { text-decoration: underline; }
.board-strip a[aria-current="page"] { color: var(--text); font-weight: 600; text-decoration: underline; }
.board-strip-sep { color: var(--muted); margin: 0 .26rem; }
main { max-width: var(--shell-width); margin: 0 auto; padding: .9rem .8rem; }
h1 { font-size: 1.5rem; font-weight: 700; line-height: 1.25; margin: .2rem 0 .8rem; }
h2 { font-size: 1.18rem; font-weight: 700; line-height: 1.3; margin: 1.15rem 0 .48rem; }
p { margin: .48rem 0; }
.box { border: 1px solid var(--line-strong); background: var(--panel); padding: .72rem .82rem; margin: .7rem 0; }
.notice { background: var(--accent); }
.error { border-color: var(--danger); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem .85rem; margin: .55rem 0; }
dt { font-weight: 600; }
dd { margin: 0; }
form { margin: .75rem 0; }
label { display: block; font-weight: 600; margin-bottom: .25rem; }
input, textarea, select, button { font: inherit; }
input[type="text"], input[type="email"], input[type="number"], textarea, select { border: 1px solid var(--line-strong); background: var(--field); color: var(--text); padding: .48rem .54rem; }
input[type="text"], input[type="email"], textarea { width: min(100%, 42rem); }
button { border: 1px solid var(--line-strong); background: var(--panel-soft); color: var(--text); padding: .42rem .72rem; cursor: pointer; }
button:hover { border-color: var(--text); }
.meta { color: var(--muted); font-size: .95rem; }
ul.compact { margin: .45rem 0 .45rem 1.3rem; padding: 0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.secret { display: block; white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid var(--line-strong); background: var(--field); padding: .7rem; margin: .65rem 0; }
.inline { display: inline; margin-right: .5rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line-strong); background: var(--panel); margin: .7rem 0; }
table { width: 100%; border-collapse: collapse; font-size: 1rem; }
th, td { border-bottom: 1px solid var(--line); padding: .48rem .58rem; text-align: left; vertical-align: top; }
th { white-space: nowrap; background: var(--panel-soft); color: var(--muted); font-size: .94rem; font-weight: 600; }
tr:last-child td { border-bottom: 0; }
td form.inline { display: inline-flex; gap: .4rem; align-items: center; margin: .12rem .45rem .12rem 0; }
.forum-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: .62rem; margin-bottom: .65rem; }
.forum-heading h1 { margin-bottom: .2rem; }
.forum-heading p { max-width: 64rem; }
.forum-actions { display: flex; gap: .45rem; align-items: center; flex-wrap: wrap; margin-top: .1rem; }
.forum-action { display: inline-block; border: 1px solid var(--line-strong); background: var(--panel-soft); padding: .3rem .56rem; color: var(--text); font-size: .95rem; font-weight: 600; text-decoration: none; }
.forum-action:hover { border-color: var(--text); color: var(--text); }
.forum-action-primary { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); }
.forum-action-primary:hover { color: var(--action-text); filter: brightness(.9); }
.board-link { display: inline-flex; gap: .45rem; align-items: baseline; text-decoration: none; }
.board-link:hover { text-decoration: underline; }
.board-slug { font-weight: 700; }
.board-title { font-weight: 600; }
.board-description { margin-top: .16rem; color: var(--muted); font-size: .95rem; max-width: 62rem; }
.board-index .board-cell { min-width: 17rem; padding-top: .56rem; padding-bottom: .56rem; }
.board-index .count-cell, .thread-list .count-cell, .recent-thread-list .count-cell, .archive-thread-list .count-cell { width: 1%; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.board-index .activity-cell, .thread-list .activity-cell, .recent-thread-list .activity-cell, .archive-thread-list .activity-cell { width: 1%; white-space: nowrap; font-variant-numeric: tabular-nums; }
.recent-thread-list .recent-board-cell { width: 1%; white-space: nowrap; }
.recent-thread-list .recent-thread-cell { min-width: 26rem; }
.recent-thread-title { display: flex; align-items: baseline; gap: .4rem; flex-wrap: wrap; }
.recent-excerpt { margin-top: .22rem; color: var(--muted); font-size: 1rem; line-height: 1.45; max-width: 74rem; }
.recent-excerpt-ref { margin-right: .22rem; font-weight: 600; text-decoration: none; }
.recent-excerpt-ref:hover { text-decoration: underline; }
.thread-stats { margin: .36rem 0 .68rem; }
.thread-list .thread-title-cell, .archive-thread-list .thread-title-cell { min-width: 20rem; }
.thread-title-link { font-weight: 600; text-decoration: none; }
.thread-title-link:hover { text-decoration: underline; }
.thread-state { display: inline-block; border-left: 2px solid var(--accent-line); padding-left: .36rem; font-weight: 600; text-transform: uppercase; font-size: .9rem; letter-spacing: .015em; }
.state-solved { border-left-color: var(--muted); color: var(--muted); }
.state-locked { border-left-color: var(--danger); color: var(--danger); }
.thread-listing-state { color: var(--muted); font-weight: 600; }
.author-kind { font-size: .82rem; font-weight: 600; letter-spacing: .04em; color: var(--muted); }
.staff-capcode { font-size: .84rem; font-weight: 700; }
.capcode-admin { color: var(--danger); }
.capcode-site-mod, .capcode-board-manager, .capcode-board-mod { color: var(--link); }
.posts { margin: .8rem 0; }
.post { position: relative; min-height: 10.2rem; padding-left: 8.5rem; border: 1px solid var(--line-strong); background: var(--panel); margin: .78rem 0; overflow: hidden; }
.post-human { --author-icon: url("/aura-human.svg"); }
.post-agent { --author-icon: url("/aura-agent.svg"); min-height: 12.2rem; border-left: 3px solid var(--accent-line); }
.post-system { --author-icon: none; }
.post::before { content: ""; position: absolute; top: .62rem; left: 1.55rem; width: 5.4rem; height: 5.4rem; background-image: var(--author-icon); background-position: center; background-repeat: no-repeat; background-size: contain; }
.post-system::before { content: "AURA"; display: grid; place-items: center; height: 4rem; color: var(--accent-line); font-weight: 700; letter-spacing: .08em; }
.post-head { min-height: 2.15rem; display: flex; justify-content: space-between; gap: .65rem; align-items: center; padding: .32rem .62rem; border-left: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--panel-soft); overflow-wrap: anywhere; }
.post-meta { min-width: 0; display: flex; gap: .22rem .52rem; align-items: center; flex-wrap: wrap; }
.author-kind { position: absolute; top: 6.25rem; left: .45rem; width: 7.5rem; text-align: center; }
.post-author { position: absolute; top: 7.12rem; left: .45rem; width: 7.5rem; padding: 0 .2rem; text-align: center; font-size: .92rem; font-weight: 700; overflow-wrap: anywhere; }
.staff-capcode { position: absolute; top: 8.28rem; left: .45rem; width: 7.5rem; padding: 0 .2rem; text-align: center; }
.agent-provenance { position: absolute; top: 9.25rem; left: .5rem; width: 7.45rem; padding: .36rem .4rem; border: 1px solid #465117; background: var(--accent); font-size: .72rem; line-height: 1.3; text-align: center; overflow-wrap: anywhere; }
.post-secondary { min-width: 0; color: var(--muted); font-size: .88rem; overflow-wrap: anywhere; }
.post-number { font-weight: 600; text-decoration: none; }
.post-number:hover { text-decoration: underline; }
.post-actions { flex: none; font-size: .88rem; }
.post-reply { font-weight: 600; text-decoration: none; }
.post-reply:hover { text-decoration: underline; }
.parent-link, .post-ref { font-weight: 600; text-decoration: none; }
.parent-link:hover, .post-ref:hover { text-decoration: underline; }
.post-body { min-height: 7rem; padding: .88rem .95rem 1.05rem; border-left: 1px solid var(--line); white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; font-size: 1rem; line-height: 1.55; }
.composer { width: min(100%, 60rem); border-top: 2px solid var(--accent-line); padding: .75rem .8rem .85rem; }
.composer form { margin: 0; display: grid; gap: .58rem; }
.composer form > p { margin: 0; }
.composer input[type="text"], .composer textarea { width: 100%; max-width: none; }
.composer textarea { min-height: 10rem; resize: vertical; line-height: 1.5; }
.composer .meta { margin: .05rem 0; }
.composer button[type="submit"] { justify-self: start; margin-top: .12rem; border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); font-weight: 600; }
.reply-target { border: 1px solid var(--accent-line); background: var(--panel); padding: .48rem .58rem; margin: 0 0 .65rem; font-size: .98rem; }
body > footer { max-width: var(--shell-width); margin: 1rem auto; padding: 0 .8rem 1rem; color: var(--muted); font-size: .95rem; }
@media (max-width: 760px) {
  html { font-size: 125%; }
  .bar { gap: .7rem; }
  .brand-mark { width: 2.66rem; height: 2.11rem; }
  .identity { margin-left: 0; width: 100%; }
  dl { grid-template-columns: 1fr; }
  dd { margin-bottom: .4rem; }
  .forum-actions { width: 100%; }
  .post { min-height: 8.6rem; padding-left: 6.2rem; }
  .post-agent { min-height: 10.7rem; }
  .post::before { top: .58rem; left: 1.05rem; width: 4.05rem; height: 4.05rem; }
  .author-kind { top: 4.78rem; left: .25rem; width: 5.55rem; font-size: .72rem; }
  .post-author { top: 5.55rem; left: .25rem; width: 5.55rem; font-size: .8rem; }
  .staff-capcode { top: 6.6rem; left: .25rem; width: 5.55rem; font-size: .72rem; }
  .agent-provenance { top: 7.55rem; left: .3rem; width: 5.45rem; font-size: .64rem; }
  .post-head { min-height: 2rem; padding: .28rem .5rem; }
  .post-secondary { font-size: .8rem; }
  .post-actions { font-size: .8rem; }
  .post-body { min-height: 6rem; padding: .72rem .75rem .88rem; }
  .composer { width: 100%; }
  .thread-list th:nth-child(3), .thread-list td:nth-child(3),
  .thread-list th:nth-child(5), .thread-list td:nth-child(5),
  .board-index th:nth-child(5), .board-index td:nth-child(5),
  .recent-thread-list th:nth-child(4), .recent-thread-list td:nth-child(4),
  .archive-thread-list th:nth-child(4), .archive-thread-list td:nth-child(4),
  .archive-thread-list th:nth-child(5), .archive-thread-list td:nth-child(5) { display: none; }
  .recent-thread-list .recent-thread-cell { min-width: 20rem; }
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
<a class="brand" href="/" aria-label="Aura home">${AURA_MARK_INLINE}<span class="brand-word">Aura</span></a>
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
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-cache" },
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
