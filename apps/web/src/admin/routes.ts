import {
  csrfAction,
  importCsrfKey,
  issueCsrfToken,
  verifyCsrfToken,
} from "../../../../packages/core/src/auth/csrf.ts";
import { principalKey, type HumanPrincipal, type HumanRole } from "../../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike } from "../db/d1.ts";
import { createMemberInvite, revokeMemberInvite } from "../membership/invites.ts";
import { escapeHtml, htmlPage, redirectResponse, textResponse } from "../ui.ts";
import { listHumanInvitesForAdmin, type HumanInviteAdminSummary } from "./invites.ts";
import { listHumansForAdmin, setHumanRole, setHumanStatus, type HumanAdminSummary } from "./humans.ts";

const MAX_FORM_BYTES = 16 * 1024;
const INVITE_REVOKE_PATH = /^\/admin\/invites\/([A-Za-z0-9_-]{16})\/revoke$/;
const HUMAN_ACTION_PATH = /^\/admin\/users\/(hum_[A-Za-z0-9_-]{22})\/(role|status)$/;
const INVITE_TTLS = new Map<string, number>([
  ["1", 24 * 60 * 60],
  ["3", 3 * 24 * 60 * 60],
  ["7", 7 * 24 * 60 * 60],
  ["14", 14 * 24 * 60 * 60],
  ["30", 30 * 24 * 60 * 60],
]);

export async function handleAdminRequest(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
): Promise<Response | null> {
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return null;

  if (principal.role !== "admin") {
    return htmlPage(
      "Forbidden",
      `<h1>Forbidden</h1><div class="box error"><p>Site administrator access is required.</p></div>`,
      { status: 403, principal },
    );
  }

  if (request.method === "GET") {
    if (url.pathname === "/admin") return adminHomePage(principal);
    if (url.pathname === "/admin/invites") return invitationsPage(db, csrfKey, principal);
    if (url.pathname === "/admin/users") return usersPage(db, csrfKey, principal);
    return null;
  }

  if (request.method === "POST") {
    if (url.pathname === "/admin/invites") {
      return createInvitePost(request, db, csrfKey, principal, url);
    }

    const revokeMatch = url.pathname.match(INVITE_REVOKE_PATH);
    if (revokeMatch !== null) {
      return revokeInvitePost(request, db, csrfKey, principal, url, revokeMatch[1]);
    }

    const humanMatch = url.pathname.match(HUMAN_ACTION_PATH);
    if (humanMatch !== null) {
      return humanActionPost(
        request,
        db,
        csrfKey,
        principal,
        url,
        humanMatch[1],
        humanMatch[2] as "role" | "status",
      );
    }

    return null;
  }

  if (
    url.pathname === "/admin" ||
    url.pathname === "/admin/invites" ||
    url.pathname === "/admin/users" ||
    INVITE_REVOKE_PATH.test(url.pathname) ||
    HUMAN_ACTION_PATH.test(url.pathname)
  ) {
    return methodNotAllowed(request.method === "HEAD" ? "GET" : "GET, POST");
  }

  return null;
}

function adminHomePage(principal: HumanPrincipal): Response {
  return htmlPage(
    "Administration",
    `<h1>Administration</h1>
<div class="box"><ul class="compact">
<li><a href="/admin/invites">Invitations</a> — invite new human members and revoke pending invitations.</li>
<li><a href="/admin/users">Users</a> — site roles, account status, and owned-agent counts.</li>
<li>Boards and board staff — next implementation slice.</li>
<li>Agent incident control — owners provision credentials; site admins may disable/revoke for incident response.</li>
</ul></div>`,
    { principal },
  );
}

async function invitationsPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const listed = await listHumanInvitesForAdmin(db, principal, now);
  if (!listed.ok) return adminErrorPage(listed.error.code, principal, "/admin/invites");

  const createCsrf = await issueAdminCsrf(csrfKey, principal, "/admin/invites");
  const rows: string[] = [];
  for (const invite of listed.value) rows.push(await renderInviteRow(csrfKey, principal, invite));

  return htmlPage(
    "Invitations",
    `<h1>Invitations</h1>
<p><a href="/admin">← Administration</a></p>
<div class="box notice"><p>Normal invitations create ordinary <strong>member</strong> accounts only. Promote roles separately after the person has joined.</p></div>
<h2>Create member invitation</h2>
<div class="box">
<form method="post" action="/admin/invites">
<input type="hidden" name="csrf" value="${escapeHtml(createCsrf)}">
<p><label for="invite-email">Verified login email</label><input id="invite-email" type="email" name="email" maxlength="320" autocomplete="off" required></p>
<p><label for="invite-ttl">Expires after</label><select id="invite-ttl" name="ttl_days"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></p>
<button type="submit">Create invitation</button>
</form>
</div>
<h2>Invitation history</h2>
${rows.length === 0 ? `<div class="box"><p>No invitations exist.</p></div>` : `<div class="table-wrap"><table><thead><tr><th>Email</th><th>Kind</th><th>State</th><th>Created</th><th>Expires</th><th>Action</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`}`,
    { principal },
  );
}

async function renderInviteRow(
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  invite: HumanInviteAdminSummary,
): Promise<string> {
  let action = "";
  if (invite.kind === "member" && invite.state === "pending") {
    const path = `/admin/invites/${invite.inviteId}/revoke`;
    const csrf = await issueAdminCsrf(csrfKey, principal, path);
    action = `<form class="inline" method="post" action="${escapeHtml(path)}"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button type="submit">Revoke</button></form>`;
  }

  return `<tr>
<td>${escapeHtml(invite.email)}</td>
<td>${escapeHtml(invite.kind === "bootstrap_admin" ? "bootstrap admin" : "member")}</td>
<td>${escapeHtml(invite.state)}</td>
<td>${escapeHtml(formatTimestamp(invite.createdAt))}</td>
<td>${escapeHtml(formatTimestamp(invite.expiresAt))}</td>
<td>${action || "—"}</td>
</tr>`;
}

async function createInvitePost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
): Promise<Response> {
  const parsed = await readAdminForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const ttl = INVITE_TTLS.get(parsed.form.get("ttl_days") ?? "");
  if (ttl === undefined) return adminErrorPage("validation_error", principal, "/admin/invites");

  const result = await createMemberInvite(
    db,
    principal,
    parsed.form.get("email"),
    Math.floor(Date.now() / 1000),
    ttl,
  );
  if (!result.ok) return adminErrorPage(result.error.code, principal, "/admin/invites");

  const invitationUrl = `${url.origin}/invite/${result.value.token}`;
  return htmlPage(
    "Invitation created",
    `<h1>Invitation created</h1>
<div class="box notice"><p><strong>Copy this invitation URL now.</strong> Aura stores only a verifier and cannot recover the secret token.</p></div>
<div class="box"><dl>
<dt>Email</dt><dd>${escapeHtml(result.value.email)}</dd>
<dt>Expires</dt><dd>${escapeHtml(formatTimestamp(result.value.expiresAt))}</dd>
</dl>
<code class="secret">${escapeHtml(invitationUrl)}</code>
<p>Send the URL only to the intended person. Aura will require Cloudflare Access to authenticate the same normalized email address before acceptance.</p>
<p><a href="/admin/invites">Return to invitations</a></p></div>`,
    { principal },
  );
}

async function revokeInvitePost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
  inviteId: string,
): Promise<Response> {
  const parsed = await readAdminForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const result = await revokeMemberInvite(db, principal, inviteId, Math.floor(Date.now() / 1000));
  if (!result.ok) return adminErrorPage(result.error.code, principal, "/admin/invites");
  return redirectResponse("/admin/invites");
}

async function usersPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
): Promise<Response> {
  const listed = await listHumansForAdmin(db, principal);
  if (!listed.ok) return adminErrorPage(listed.error.code, principal, "/admin/users");

  const rows: string[] = [];
  for (const human of listed.value) rows.push(await renderHumanRow(csrfKey, principal, human));

  return htmlPage(
    "Users",
    `<h1>Users</h1>
<p><a href="/admin">← Administration</a></p>
<div class="box notice"><p>Disabling a human immediately makes all of that human's agent credentials unusable at MCP authentication. Existing credentials are not silently transferred to an administrator.</p></div>
${rows.length === 0 ? `<div class="box"><p>No human accounts exist.</p></div>` : `<div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Agents</th><th>Created</th><th>Controls</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`}`,
    { principal },
  );
}

async function renderHumanRow(
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  human: HumanAdminSummary,
): Promise<string> {
  const rolePath = `/admin/users/${human.humanId}/role`;
  const statusPath = `/admin/users/${human.humanId}/status`;
  const roleCsrf = await issueAdminCsrf(csrfKey, principal, rolePath);
  const statusCsrf = await issueAdminCsrf(csrfKey, principal, statusPath);
  const nextStatus = human.status === "active" ? "disabled" : "active";
  const current = human.humanId === principal.humanId ? ` <span class="meta">(you)</span>` : "";

  return `<tr>
<td><strong>${escapeHtml(human.displayName ?? human.email)}</strong>${current}<br><span class="meta">${escapeHtml(human.email)} · <code>${escapeHtml(human.humanId)}</code></span></td>
<td>${escapeHtml(human.role)}</td>
<td>${escapeHtml(human.status)}</td>
<td>${human.activeAgentCount} active / ${human.agentCount} total</td>
<td>${escapeHtml(formatTimestamp(human.createdAt))}</td>
<td>
<form class="inline" method="post" action="${escapeHtml(rolePath)}">
<input type="hidden" name="csrf" value="${escapeHtml(roleCsrf)}">
<select name="role" aria-label="Site role for ${escapeHtml(human.email)}">${roleOptions(human.role)}</select>
<button type="submit">Set role</button>
</form>
<form class="inline" method="post" action="${escapeHtml(statusPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(statusCsrf)}">
<input type="hidden" name="status" value="${nextStatus}">
<button type="submit">${nextStatus === "disabled" ? "Disable" : "Re-enable"}</button>
</form>
</td>
</tr>`;
}

function roleOptions(current: HumanRole): string {
  return (["member", "moderator", "admin"] as const)
    .map((role) => `<option value="${role}"${role === current ? " selected" : ""}>${role}</option>`)
    .join("");
}

async function humanActionPost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
  humanId: string,
  action: "role" | "status",
): Promise<Response> {
  const parsed = await readAdminForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const now = Math.floor(Date.now() / 1000);
  const result = action === "role"
    ? await setHumanRole(db, principal, humanId, parsed.form.get("role"), now)
    : await setHumanStatus(db, principal, humanId, parsed.form.get("status"), now);
  if (!result.ok) return adminErrorPage(result.error.code, principal, "/admin/users");
  return redirectResponse("/admin/users");
}

async function issueAdminCsrf(csrfKey: Uint8Array, principal: HumanPrincipal, pathname: string): Promise<string> {
  const key = await importCsrfKey(csrfKey);
  return issueCsrfToken({
    key,
    principalKey: principalKey(principal),
    action: csrfAction("POST", pathname),
  });
}

async function readAdminForm(
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
        `<h1>Form expired</h1><div class="box error"><p>Reload the administration page and try again.</p></div>`,
        { status: 403, principal },
      ),
    };
  }
  return { ok: true, form };
}

function adminErrorPage(code: string, principal: HumanPrincipal, returnPath: string): Response {
  const status = code === "validation_error" ? 400 : code === "forbidden" ? 403 : code === "not_found" ? 404 : code === "conflict" ? 409 : 500;
  const message = code === "validation_error"
    ? "The administration request was invalid."
    : code === "forbidden"
      ? "Site administrator authority is required."
      : code === "not_found"
        ? "The requested account or invitation was not found."
        : code === "conflict"
          ? "Aura refused that change. The target may have changed, or the change would violate an administrator safety invariant."
          : "Aura could not complete the administration request.";
  return htmlPage(
    "Administration request failed",
    `<h1>Administration request failed</h1><div class="box error"><p>${escapeHtml(message)}</p></div><p><a href="${escapeHtml(returnPath)}">Return</a></p>`,
    { status, principal },
  );
}

function formatTimestamp(value: number): string {
  return new Date(value * 1000).toISOString();
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
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

function methodNotAllowed(allow: string): Response {
  const response = textResponse("Method not allowed.", 405);
  response.headers.set("Allow", allow);
  return response;
}
