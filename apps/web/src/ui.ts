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

export const AURA_CSS = String.raw`
:root {
  color-scheme: light dark;
  --bg: #f4f1ea;
  --panel: #fffdf8;
  --text: #202020;
  --muted: #67635d;
  --line: #b9b2a7;
  --link: #184d85;
  --accent: #d7e4ef;
  --danger: #7d2525;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #191919;
    --panel: #222;
    --text: #ececec;
    --muted: #aaa49b;
    --line: #55504a;
    --link: #8bc4ff;
    --accent: #293847;
    --danger: #ff9d9d;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.45; }
a { color: var(--link); }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
header { border-bottom: 1px solid var(--line); background: var(--panel); }
.bar { max-width: 1050px; margin: 0 auto; padding: .55rem .8rem; display: flex; gap: 1rem; align-items: baseline; flex-wrap: wrap; }
.brand { font-weight: 800; letter-spacing: .02em; text-decoration: none; color: var(--text); }
nav { display: flex; gap: .8rem; flex-wrap: wrap; }
.identity { margin-left: auto; color: var(--muted); font-size: .9rem; }
main { max-width: 1050px; margin: 0 auto; padding: .8rem; }
h1 { font-size: 1.35rem; margin: .2rem 0 .8rem; }
h2 { font-size: 1.05rem; margin: 1.1rem 0 .45rem; }
p { margin: .45rem 0; }
.box { border: 1px solid var(--line); background: var(--panel); padding: .7rem .8rem; margin: .65rem 0; }
.notice { background: var(--accent); }
.error { border-color: var(--danger); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .3rem .8rem; margin: .5rem 0; }
dt { font-weight: 700; }
dd { margin: 0; }
form { margin: .75rem 0; }
label { display: block; font-weight: 700; margin-bottom: .25rem; }
input, textarea, button { font: inherit; }
input[type="text"], input[type="email"], textarea { width: min(100%, 42rem); border: 1px solid var(--line); background: var(--panel); color: var(--text); padding: .45rem .5rem; }
button { border: 1px solid var(--line); background: var(--panel); color: var(--text); padding: .4rem .75rem; cursor: pointer; }
button:hover { filter: brightness(.97); }
.meta { color: var(--muted); font-size: .9rem; }
ul.compact { margin: .4rem 0 .4rem 1.25rem; padding: 0; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
footer { max-width: 1050px; margin: 1rem auto; padding: 0 .8rem 1rem; color: var(--muted); font-size: .85rem; }
@media (max-width: 640px) {
  .identity { margin-left: 0; width: 100%; }
  dl { grid-template-columns: 1fr; }
  dd { margin-bottom: .35rem; }
}
`;

export function htmlPage(
  title: string,
  body: string,
  options: { readonly status?: number; readonly principal?: HumanPrincipal | null } = {},
): Response {
  const principal = options.principal ?? null;
  const adminLink = principal?.role === "admin" ? `<a href="/admin">Admin</a>` : "";
  const identity = principal
    ? `<span class="identity">${escapeHtml(principal.displayName ?? principal.email)} · ${escapeHtml(principal.role)}</span>`
    : "";
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
<nav aria-label="Primary"><a href="/">Boards</a><a href="/rules">Rules</a><a href="/account">Account</a>${adminLink}</nav>
${identity}
</div></header>
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
