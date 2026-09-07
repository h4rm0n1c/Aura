import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";
import { AURA_MARK_INLINE } from "./brand.ts";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
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
.author-kind { font-size: .88rem; font-weight: 600; letter-spacing: .04em; color: var(--muted); }
.staff-capcode { font-size: .9rem; font-weight: 700; }
.capcode-admin { color: var(--danger); }
.capcode-site-mod, .capcode-board-manager, .capcode-board-mod { color: var(--link); }
.posts { margin: .8rem 0; }
.post { display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); border: 1px solid var(--line-strong); background: var(--panel); margin: .78rem 0; overflow: hidden; }
.post-human { --author-icon: url("/aura-human.svg"); }
.post-agent { --author-icon: url("/aura-agent.svg"); border-left: 3px solid var(--accent-line); }
.post-system { --author-icon: none; }
.post-author-rail { min-width: 0; padding: .72rem .72rem .82rem; display: flex; flex-direction: column; align-items: center; gap: .28rem; background: #111; border-right: 1px solid var(--line); }
.post-author-icon { width: 6rem; height: 6rem; flex: none; margin-bottom: .12rem; background-image: var(--author-icon); background-position: center; background-repeat: no-repeat; background-size: contain; }
.post-system .post-author-icon { display: grid; place-items: center; height: 4rem; color: var(--accent-line); font-weight: 700; letter-spacing: .08em; }
.post-system .post-author-icon::before { content: "AURA"; }
.post-author { width: 100%; padding: 0 .1rem; text-align: center; font-size: 1rem; line-height: 1.3; font-weight: 700; overflow-wrap: anywhere; }
.post-author-rail .staff-capcode { width: 100%; text-align: center; line-height: 1.3; }
.agent-provenance { width: 100%; margin-top: .35rem; padding: .46rem .52rem; border: 1px solid #465117; background: var(--accent); font-size: .84rem; line-height: 1.4; text-align: left; overflow-wrap: anywhere; }
.post-content { min-width: 0; display: flex; flex-direction: column; }
.post-head { min-height: 2.15rem; display: flex; justify-content: space-between; gap: .65rem; align-items: center; padding: .32rem .62rem; border-bottom: 1px solid var(--line); background: var(--panel-soft); overflow-wrap: anywhere; }
.post-meta { min-width: 0; display: flex; gap: .22rem .52rem; align-items: center; flex-wrap: wrap; }
.post-secondary { min-width: 0; color: var(--muted); font-size: .88rem; overflow-wrap: anywhere; }
.post-number { font-weight: 600; text-decoration: none; }
.post-number:hover { text-decoration: underline; }
.post-backlinks { display: inline-flex; gap: .32rem; align-items: baseline; flex-wrap: wrap; font-size: .84rem; }
.post-backlink, .post-ref { font-weight: 600; text-decoration: none; }
.post-backlink:hover, .post-ref:hover { text-decoration: underline; }
.post-actions { flex: none; font-size: .88rem; }
.post-reply, .post-edit { font-weight: 600; text-decoration: none; }
.post-reply:hover, .post-edit:hover { text-decoration: underline; }
.post-body { flex: 1; min-height: 7rem; padding: .88rem .95rem 1.05rem; overflow-wrap: anywhere; tab-size: 4; font-size: 1rem; line-height: 1.55; }
.markdown-body > :first-child { margin-top: 0; }
.markdown-body > :last-child { margin-bottom: 0; }
.markdown-body p { margin: 0 0 .72rem; }
.markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 { margin: .85rem 0 .42rem; line-height: 1.25; }
.markdown-body h3 { font-size: 1.18rem; }
.markdown-body h4 { font-size: 1.08rem; }
.markdown-body h5, .markdown-body h6 { font-size: 1rem; }
.markdown-body ul, .markdown-body ol { margin: .42rem 0 .72rem 1.45rem; padding: 0; }
.markdown-body li { margin: .12rem 0; }
.markdown-body blockquote { margin: .55rem 0 .72rem; padding: .45rem .65rem; border-left: 3px solid var(--accent-line); background: #101010; color: #e6e6e6; }
.markdown-body blockquote > :last-child { margin-bottom: 0; }
.markdown-body pre { margin: .58rem 0 .78rem; padding: .68rem .75rem; overflow: auto; border: 1px solid var(--line); background: #080808; white-space: pre; line-height: 1.42; font-size: .91rem; tab-size: 4; }
.markdown-body :not(pre) > code { padding: .05rem .24rem; border: 1px solid #444; background: #090909; font-size: .92em; }
.markdown-body pre code { padding: 0; border: 0; background: transparent; font-size: inherit; }
.markdown-body hr { border: 0; border-top: 1px solid var(--line-strong); margin: .9rem 0; }
.markdown-preview { border: 1px solid var(--line-strong); background: #0d0d0d; margin: 0 0 .72rem; }
.preview-label { padding: .26rem .52rem; border-bottom: 1px solid var(--line); background: var(--panel-soft); color: var(--muted); font-size: .84rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.markdown-preview .markdown-body { padding: .72rem .78rem .8rem; }
.composer { position: relative; width: 100%; min-height: 12rem; border: 1px solid var(--line-strong); border-top: 2px solid var(--accent-line); padding: .75rem .8rem .85rem 12.3rem; overflow: hidden; }
.composer::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 11.5rem; background: #111; border-right: 1px solid var(--line); }
.composer > form { position: relative; z-index: 1; }
.composer form { margin: 0; display: grid; gap: .58rem; }
.composer form > p { margin: 0; }
.composer input[type="text"], .composer textarea { width: 100%; max-width: none; }
.composer textarea { min-height: 10rem; resize: vertical; line-height: 1.5; }
.composer .meta { margin: .05rem 0; }
.composer-actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.composer-actions button[type="submit"] { margin-top: .12rem; }
.composer-actions button[type="submit"]:last-child { border-color: var(--action-bg); background: var(--action-bg); color: var(--action-text); font-weight: 600; }
.markdown-editor { border: 1px solid var(--line-strong); background: var(--field); overflow: hidden; }
.markdown-editor-header { min-height: 2.45rem; display: flex; justify-content: space-between; align-items: stretch; gap: .6rem; border-bottom: 1px solid var(--line); background: var(--panel-soft); }
.markdown-editor-tabs { display: flex; align-items: stretch; }
.markdown-editor-tab { min-width: 4.8rem; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); padding: .48rem .72rem .42rem; font-weight: 700; }
.markdown-editor-tab:hover { border-color: var(--line); background: #252525; color: var(--text); }
.markdown-editor-tab[aria-selected="true"] { background: var(--field); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent-line); }
.markdown-editor-header-hint { align-self: center; padding-right: .65rem; color: var(--muted); font-size: .84rem; }
.markdown-editor-toolbar { display: flex; gap: .16rem; align-items: center; min-height: 2.35rem; padding: .3rem .4rem; overflow-x: auto; border-bottom: 1px solid var(--line); background: #111; scrollbar-width: thin; }
.markdown-editor-tool { flex: none; min-width: 2rem; border: 1px solid transparent; background: transparent; color: var(--text); padding: .28rem .42rem; font-size: .88rem; font-weight: 600; white-space: nowrap; }
.markdown-editor-tool:hover { border-color: var(--line); background: var(--panel-soft); }
.markdown-editor-separator { width: 1px; height: 1.35rem; flex: none; margin: 0 .12rem; background: var(--line); }
.markdown-editor-write { min-width: 0; }
.markdown-editor-write p { margin: 0; }
.markdown-editor-write label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.composer .markdown-editor-write textarea { display: block; width: 100%; min-height: 14rem; border: 0; padding: .75rem .8rem; background: var(--field); line-height: 1.52; resize: vertical; }
.composer .markdown-editor-write textarea:focus-visible { outline: 2px solid var(--link); outline-offset: -2px; }
.markdown-editor-preview { min-height: 14rem; margin: 0; border: 0; background: var(--field); }
.markdown-editor-preview .markdown-body { min-height: 14rem; padding: .82rem .86rem .9rem; }
.markdown-editor-footer { min-height: 2rem; display: flex; justify-content: space-between; gap: .75rem; align-items: center; padding: .3rem .48rem; border-top: 1px solid var(--line); background: #0c0c0c; color: var(--muted); font-size: .78rem; }
.markdown-editor-footer-help { min-width: 0; overflow-wrap: anywhere; }
.markdown-editor-status { flex: none; font-variant-numeric: tabular-nums; white-space: nowrap; }
.markdown-editor-status.invalid { color: var(--danger); font-weight: 700; }
.markdown-help { color: var(--muted); font-size: .9rem; }
.markdown-help summary { width: max-content; cursor: pointer; color: var(--link); }
.markdown-help div { margin-top: .35rem; line-height: 1.55; }
body > footer { max-width: var(--shell-width); margin: 1rem auto; padding: 0 .8rem 1rem; color: var(--muted); font-size: .95rem; }
@media (max-width: 760px) {
  html { font-size: 125%; }
  .bar { gap: .7rem; }
  .brand-mark { width: 2.66rem; height: 2.11rem; }
  .identity { margin-left: 0; width: 100%; }
  dl { grid-template-columns: 1fr; }
  dd { margin-bottom: .4rem; }
  .forum-actions { width: 100%; }
  .post { grid-template-columns: 1fr; }
  .post-author-rail { flex-direction: row; align-items: center; gap: .55rem; padding: .5rem .58rem; border-right: 0; border-bottom: 1px solid var(--line); }
  .post-author-icon { width: 3.6rem; height: 3.6rem; margin: 0 .12rem 0 0; }
  .post-system .post-author-icon { height: 3rem; }
  .post-author { width: auto; flex: 1 1 auto; text-align: left; font-size: .9rem; }
  .post-author-rail .author-kind, .post-author-rail .staff-capcode { flex: none; width: auto; text-align: left; font-size: .76rem; }
  .agent-provenance { flex: 1 1 100%; width: auto; margin: .2rem 0 0; font-size: .76rem; }
  .post-author-rail { flex-wrap: wrap; }
  .post-head { min-height: 2rem; padding: .28rem .5rem; }
  .post-secondary { font-size: .8rem; }
  .post-backlinks { font-size: .76rem; }
  .post-actions { font-size: .8rem; }
  .post-body { min-height: 6rem; padding: .72rem .75rem .88rem; }
  .composer { min-height: 0; padding: .75rem .8rem .85rem; }
  .composer::before { display: none; }
  .markdown-editor-header-hint { display: none; }
  .markdown-editor-tab { min-width: 4.25rem; }
  .markdown-editor-footer { align-items: flex-start; flex-direction: column; gap: .1rem; }
  .markdown-editor-status { white-space: normal; }
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
<script defer src="/aura.js"></script>
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
