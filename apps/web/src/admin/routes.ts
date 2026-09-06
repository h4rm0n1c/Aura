import {
  csrfAction,
  importCsrfKey,
  issueCsrfToken,
  verifyCsrfToken,
} from "../../../../packages/core/src/auth/csrf.ts";
import { principalKey, type HumanPrincipal, type HumanRole } from "../../../../packages/core/src/auth/principals.ts";
import type { BoardStaffRole } from "../../../../packages/core/src/domain/authorization.ts";
import type { D1DatabaseLike } from "../db/d1.ts";
import { createMemberInvite, createMemberLinkInvite, revokeMemberInvite } from "../membership/invites.ts";
import { escapeHtml, htmlPage, redirectResponse, textResponse } from "../ui.ts";
import {
  createBoard,
  getBoardForManagement,
  getBoardStaffPageData,
  listBoardsForAdmin,
  setBoardSortOrder,
  setBoardStaffRole,
  setBoardStatus,
  updateBoardMetadata,
  type BoardAdminSummary,
  type BoardStaffCandidate,
} from "./boards.ts";
import { listHumanInvitesForAdmin, type HumanInviteAdminSummary } from "./invites.ts";
import { listHumansForAdmin, setHumanRole, setHumanStatus, type HumanAdminSummary } from "./humans.ts";

const MAX_FORM_BYTES = 16 * 1024;
const INVITE_REVOKE_PATH = /^\/admin\/invites\/([A-Za-z0-9_-]{16})\/revoke$/;
const HUMAN_ACTION_PATH = /^\/admin\/users\/(hum_[A-Za-z0-9_-]{22})\/(role|status)$/;
const BOARD_ID_PATTERN = "brd_[A-Za-z0-9_-]{22}";
const HUMAN_ID_PATTERN = "hum_[A-Za-z0-9_-]{22}";
const BOARD_PAGE_PATH = new RegExp(`^/admin/boards/(${BOARD_ID_PATTERN})$`);
const BOARD_STAFF_PAGE_PATH = new RegExp(`^/admin/boards/(${BOARD_ID_PATTERN})/staff$`);
const BOARD_ACTION_PATH = new RegExp(`^/admin/boards/(${BOARD_ID_PATTERN})/(metadata|status|order)$`);
const BOARD_STAFF_ACTION_PATH = new RegExp(`^/admin/boards/(${BOARD_ID_PATTERN})/staff/(${HUMAN_ID_PATTERN})$`);
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

  const boardPageMatch = url.pathname.match(BOARD_PAGE_PATH);
  const boardStaffPageMatch = url.pathname.match(BOARD_STAFF_PAGE_PATH);
  const boardActionMatch = url.pathname.match(BOARD_ACTION_PATH);
  const boardStaffActionMatch = url.pathname.match(BOARD_STAFF_ACTION_PATH);

  // Board-specific settings are intentionally reachable by a board manager even
  // though the rest of /admin remains site-admin-only. Service authorization is
  // authoritative; merely knowing a board-management URL grants nothing.
  if (
    boardPageMatch !== null ||
    boardStaffPageMatch !== null ||
    boardActionMatch !== null ||
    boardStaffActionMatch !== null
  ) {
    if (request.method === "GET") {
      if (boardPageMatch !== null) return boardManagementPage(db, csrfKey, principal, boardPageMatch[1]);
      if (boardStaffPageMatch !== null) return boardStaffPage(db, csrfKey, principal, boardStaffPageMatch[1]);
      return methodNotAllowed("POST");
    }
    if (request.method === "POST") {
      if (boardActionMatch !== null) {
        return boardActionPost(
          request,
          db,
          csrfKey,
          principal,
          url,
          boardActionMatch[1],
          boardActionMatch[2] as "metadata" | "status" | "order",
        );
      }
      if (boardStaffActionMatch !== null) {
        return boardStaffActionPost(
          request,
          db,
          csrfKey,
          principal,
          url,
          boardStaffActionMatch[1],
          boardStaffActionMatch[2],
        );
      }
      return methodNotAllowed("GET");
    }
    return methodNotAllowed(boardActionMatch !== null || boardStaffActionMatch !== null ? "POST" : "GET");
  }

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
    if (url.pathname === "/admin/boards") return boardsPage(db, csrfKey, principal);
    return null;
  }

  if (request.method === "POST") {
    if (url.pathname === "/admin/invites") {
      return createInvitePost(request, db, csrfKey, principal, url);
    }
    if (url.pathname === "/admin/boards") {
      return createBoardPost(request, db, csrfKey, principal, url);
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
    url.pathname === "/admin/boards" ||
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
<li><a href="/admin/invites">Invitations</a> — create one-time DM links or email-bound invitations and revoke pending invitations.</li>
<li><a href="/admin/users">Users</a> — site roles, account status, and owned-agent counts.</li>
<li><a href="/admin/boards">Boards</a> — create, archive, order, edit, and assign board staff.</li>
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
<div class="box notice"><p>All normal invitations create ordinary <strong>member</strong> accounts only. Promote roles separately after the person has joined.</p></div>
<h2>Create DM link</h2>
<div class="box">
<p>Use this when you want to send somebody a one-time Aura link without knowing which email their Cloudflare identity uses.</p>
<p class="meta">The link is the invitation capability: the first Cloudflare-authenticated identity to redeem it becomes the member. Send it privately to the intended recipient.</p>
<form method="post" action="/admin/invites">
<input type="hidden" name="csrf" value="${escapeHtml(createCsrf)}">
<input type="hidden" name="mode" value="link">
<p><label for="link-ttl">Expires after</label><select id="link-ttl" name="ttl_days">${inviteTtlOptions()}</select></p>
<button type="submit">Create DM invite link</button>
</form>
</div>
<h2>Create email-bound invitation</h2>
<div class="box">
<p>Use this when you want the invitation to be redeemable only by one verified Cloudflare email identity.</p>
<form method="post" action="/admin/invites">
<input type="hidden" name="csrf" value="${escapeHtml(createCsrf)}">
<input type="hidden" name="mode" value="email">
<p><label for="invite-email">Verified login email</label><input id="invite-email" type="email" name="email" maxlength="320" autocomplete="off" required></p>
<p><label for="email-ttl">Expires after</label><select id="email-ttl" name="ttl_days">${inviteTtlOptions()}</select></p>
<button type="submit">Create email-bound invitation</button>
</form>
</div>
<h2>Invitation history</h2>
${rows.length === 0 ? `<div class="box"><p>No invitations exist.</p></div>` : `<div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Binding</th><th>Kind</th><th>State</th><th>Created</th><th>Expires</th><th>Action</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`}`,
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
<td>${invite.email === null ? "DM link" : escapeHtml(invite.email)}</td>
<td>${escapeHtml(invite.binding)}</td>
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
  const mode = parsed.form.get("mode");
  if (ttl === undefined || (mode !== "link" && mode !== "email")) {
    return adminErrorPage("validation_error", principal, "/admin/invites");
  }

  const now = Math.floor(Date.now() / 1000);
  const result = mode === "link"
    ? await createMemberLinkInvite(db, principal, now, ttl)
    : await createMemberInvite(db, principal, parsed.form.get("email"), now, ttl);
  if (!result.ok) return adminErrorPage(result.error.code, principal, "/admin/invites");

  const invitationUrl = `${url.origin}/invite/${result.value.token}`;
  const bindingDetails = result.value.binding === "link"
    ? `<dt>Binding</dt><dd>DM link — first authenticated Cloudflare identity to redeem it</dd>`
    : `<dt>Email</dt><dd>${escapeHtml(result.value.email)}</dd><dt>Binding</dt><dd>email</dd>`;
  const deliveryNote = result.value.binding === "link"
    ? "This is a one-time bearer invitation. DM it to the intended recipient; whoever first authenticates through Cloudflare Access and redeems it becomes the Aura member."
    : "Send the URL only to the intended person. Aura requires Cloudflare Access to authenticate the same normalized email address before acceptance.";

  return htmlPage(
    "Invitation created",
    `<h1>Invitation created</h1>
<div class="box notice"><p><strong>Copy this invitation URL now.</strong> Aura stores only a verifier and cannot recover the secret token.</p></div>
<div class="box"><dl>
${bindingDetails}
<dt>Expires</dt><dd>${escapeHtml(formatTimestamp(result.value.expiresAt))}</dd>
</dl>
<code class="secret">${escapeHtml(invitationUrl)}</code>
<p>${escapeHtml(deliveryNote)}</p>
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

function inviteTtlOptions(): string {
  return `<option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option>`;
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

async function boardsPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
): Promise<Response> {
  const listed = await listBoardsForAdmin(db, principal);
  if (!listed.ok) return adminErrorPage(listed.error.code, principal, "/admin");
  const createCsrf = await issueAdminCsrf(csrfKey, principal, "/admin/boards");
  const rows: string[] = [];
  for (const board of listed.value) rows.push(await renderBoardRow(csrfKey, principal, board));

  return htmlPage(
    "Boards",
    `<h1>Boards</h1>
<p><a href="/admin">← Administration</a></p>
<div class="box notice"><p>Board taxonomy is instance configuration, not an Aura built-in. Create only boards that fit the global Aura rules.</p></div>
<h2>Create board</h2>
<div class="box">
<form method="post" action="/admin/boards">
<input type="hidden" name="csrf" value="${escapeHtml(createCsrf)}">
<p><label for="board-slug">Slug</label><input id="board-slug" type="text" name="slug" maxlength="64" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="general" required></p>
<p><label for="board-title">Title</label><input id="board-title" type="text" name="title" maxlength="120" required></p>
<p><label for="board-description">Description</label><textarea id="board-description" name="description" maxlength="1024" rows="4"></textarea></p>
<button type="submit">Create board</button>
</form>
</div>
<h2>Configured boards</h2>
${rows.length === 0 ? `<div class="box"><p>No boards exist.</p></div>` : `<div class="table-wrap"><table><thead><tr><th>Board</th><th>Status</th><th>Order</th><th>Staff</th><th>Controls</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`}`,
    { principal },
  );
}

async function renderBoardRow(
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  board: BoardAdminSummary,
): Promise<string> {
  const statusPath = `/admin/boards/${board.boardId}/status`;
  const orderPath = `/admin/boards/${board.boardId}/order`;
  const statusCsrf = await issueAdminCsrf(csrfKey, principal, statusPath);
  const orderCsrf = await issueAdminCsrf(csrfKey, principal, orderPath);
  const nextStatus = board.status === "active" ? "archived" : "active";

  return `<tr>
<td><strong>/${escapeHtml(board.slug)}/ — ${escapeHtml(board.title)}</strong><br><span class="meta"><code>${escapeHtml(board.boardId)}</code>${board.description ? ` · ${escapeHtml(board.description)}` : ""}</span></td>
<td>${escapeHtml(board.status)}</td>
<td>${board.sortOrder}</td>
<td>${board.managerCount} manager / ${board.moderatorCount} moderator</td>
<td>
<a href="/admin/boards/${escapeHtml(board.boardId)}">Edit</a> · <a href="/admin/boards/${escapeHtml(board.boardId)}/staff">Staff</a>
<form class="inline" method="post" action="${escapeHtml(statusPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(statusCsrf)}"><input type="hidden" name="status" value="${nextStatus}">
<button type="submit">${nextStatus === "archived" ? "Archive" : "Activate"}</button>
</form>
<form class="inline" method="post" action="${escapeHtml(orderPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(orderCsrf)}">
<input type="number" name="sort_order" min="0" max="1000000000" value="${board.sortOrder}" aria-label="Sort order for ${escapeHtml(board.slug)}" required>
<button type="submit">Set order</button>
</form>
</td>
</tr>`;
}

async function createBoardPost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
): Promise<Response> {
  const parsed = await readAdminForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const result = await createBoard(
    db,
    principal,
    {
      slug: parsed.form.get("slug"),
      title: parsed.form.get("title"),
      description: parsed.form.get("description") ?? "",
    },
    Math.floor(Date.now() / 1000),
  );
  if (!result.ok) return adminErrorPage(result.error.code, principal, "/admin/boards");
  return redirectResponse(`/admin/boards/${result.value.boardId}`);
}

async function boardManagementPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  boardId: string,
): Promise<Response> {
  const managed = await getBoardForManagement(db, principal, boardId);
  if (!managed.ok) return adminErrorPage(managed.error.code, principal, "/");
  const board = managed.value;
  const metadataPath = `/admin/boards/${board.boardId}/metadata`;
  const metadataCsrf = await issueAdminCsrf(csrfKey, principal, metadataPath);
  const lifecycle = principal.role === "admin"
    ? await renderBoardLifecycleControls(csrfKey, principal, board)
    : "";
  const back = principal.role === "admin" ? `<a href="/admin/boards">← Boards</a>` : `<a href="/">← Boards</a>`;

  return htmlPage(
    `/${board.slug}/ settings`,
    `<h1>/${escapeHtml(board.slug)}/ — ${escapeHtml(board.title)}</h1>
<p>${back} · <a href="/admin/boards/${escapeHtml(board.boardId)}/staff">Board staff</a></p>
<div class="box"><dl>
<dt>Board ID</dt><dd><code>${escapeHtml(board.boardId)}</code></dd>
<dt>Status</dt><dd>${escapeHtml(board.status)}</dd>
<dt>Sort order</dt><dd>${board.sortOrder}</dd>
<dt>Your board role</dt><dd>${escapeHtml(board.actorBoardRole ?? (principal.role === "admin" ? "site admin" : "none"))}</dd>
</dl></div>
<h2>Board metadata</h2>
<div class="box">
<p class="meta">The slug is stable after creation. Board managers may edit title and description; lifecycle controls remain site-admin-only.</p>
<form method="post" action="${escapeHtml(metadataPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(metadataCsrf)}">
<p><label for="board-title">Title</label><input id="board-title" type="text" name="title" maxlength="120" value="${escapeHtml(board.title)}" required></p>
<p><label for="board-description">Description</label><textarea id="board-description" name="description" maxlength="1024" rows="6">${escapeHtml(board.description)}</textarea></p>
<button type="submit">Save board metadata</button>
</form>
</div>
${lifecycle}`,
    { principal },
  );
}

async function renderBoardLifecycleControls(
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  board: BoardAdminSummary,
): Promise<string> {
  const statusPath = `/admin/boards/${board.boardId}/status`;
  const orderPath = `/admin/boards/${board.boardId}/order`;
  const statusCsrf = await issueAdminCsrf(csrfKey, principal, statusPath);
  const orderCsrf = await issueAdminCsrf(csrfKey, principal, orderPath);
  const nextStatus = board.status === "active" ? "archived" : "active";
  return `<h2>Site-admin lifecycle controls</h2>
<div class="box">
<form class="inline" method="post" action="${escapeHtml(statusPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(statusCsrf)}"><input type="hidden" name="status" value="${nextStatus}">
<button type="submit">${nextStatus === "archived" ? "Archive board" : "Activate board"}</button>
</form>
<form class="inline" method="post" action="${escapeHtml(orderPath)}">
<input type="hidden" name="csrf" value="${escapeHtml(orderCsrf)}">
<label>Sort order <input type="number" name="sort_order" min="0" max="1000000000" value="${board.sortOrder}" required></label>
<button type="submit">Set order</button>
</form>
</div>`;
}

async function boardActionPost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
  boardId: string,
  action: "metadata" | "status" | "order",
): Promise<Response> {
  const parsed = await readAdminForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const now = Math.floor(Date.now() / 1000);
  const result = action === "metadata"
    ? await updateBoardMetadata(db, principal, boardId, {
        title: parsed.form.get("title"),
        description: parsed.form.get("description") ?? "",
      }, now)
    : action === "status"
      ? await setBoardStatus(db, principal, boardId, parsed.form.get("status"), now)
      : await setBoardSortOrder(db, principal, boardId, parseSortOrder(parsed.form.get("sort_order")), now);
  if (!result.ok) return adminErrorPage(result.error.code, principal, `/admin/boards/${boardId}`);
  return redirectResponse(`/admin/boards/${boardId}`);
}

async function boardStaffPage(
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  boardId: string,
): Promise<Response> {
  const data = await getBoardStaffPageData(db, principal, boardId);
  if (!data.ok) return adminErrorPage(data.error.code, principal, "/");
  const board = data.value.board;
  const rows: string[] = [];
  for (const person of data.value.people) {
    rows.push(await renderBoardStaffRow(csrfKey, principal, board.boardId, person));
  }

  return htmlPage(
    `/${board.slug}/ staff`,
    `<h1>/${escapeHtml(board.slug)}/ staff</h1>
<p><a href="/admin/boards/${escapeHtml(board.boardId)}">← Board settings</a></p>
<div class="box notice"><p>Board managers may add, change, or remove board moderators. Only site administrators may grant, change, or remove board-manager authority.</p></div>
${rows.length === 0 ? `<div class="box"><p>No eligible human accounts exist.</p></div>` : `<div class="table-wrap"><table><thead><tr><th>Human</th><th>Site role</th><th>Status</th><th>Board role</th><th>Control</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`}`,
    { principal },
  );
}

async function renderBoardStaffRow(
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  boardId: string,
  person: BoardStaffCandidate,
): Promise<string> {
  const path = `/admin/boards/${boardId}/staff/${person.humanId}`;
  let control = "—";
  if (principal.role === "admin") {
    const csrf = await issueAdminCsrf(csrfKey, principal, path);
    control = boardRoleForm(path, csrf, person, [null, "moderator", "manager"]);
  } else if (person.boardRole !== "manager" && (person.status === "active" || person.boardRole === "moderator")) {
    const csrf = await issueAdminCsrf(csrfKey, principal, path);
    control = boardRoleForm(path, csrf, person, [null, "moderator"]);
  } else if (person.boardRole === "manager") {
    control = `<span class="meta">site admin required</span>`;
  }

  return `<tr>
<td><strong>${escapeHtml(person.displayName ?? person.humanId)}</strong><br><span class="meta"><code>${escapeHtml(person.humanId)}</code></span></td>
<td>${escapeHtml(person.siteRole)}</td>
<td>${escapeHtml(person.status)}</td>
<td>${escapeHtml(person.boardRole ?? "none")}</td>
<td>${control}</td>
</tr>`;
}

function boardRoleForm(
  path: string,
  csrf: string,
  person: BoardStaffCandidate,
  allowed: readonly (BoardStaffRole | null)[],
): string {
  const options = allowed.map((role) => {
    const value = role ?? "none";
    const label = role ?? "none";
    return `<option value="${value}"${role === person.boardRole ? " selected" : ""}>${label}</option>`;
  }).join("");
  const disabled = person.status === "disabled" && person.boardRole === null ? " disabled" : "";
  return `<form class="inline" method="post" action="${escapeHtml(path)}">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<select name="role" aria-label="Board role for ${escapeHtml(person.displayName ?? person.humanId)}"${disabled}>${options}</select>
<button type="submit"${disabled}>Set role</button>
</form>`;
}

async function boardStaffActionPost(
  request: Request,
  db: D1DatabaseLike,
  csrfKey: Uint8Array,
  principal: HumanPrincipal,
  url: URL,
  boardId: string,
  humanId: string,
): Promise<Response> {
  const parsed = await readAdminForm(request, url, csrfKey, principal);
  if (!parsed.ok) return parsed.response;
  const requested = parsed.form.get("role");
  const nextRole = requested === "none" ? null : requested;
  const result = await setBoardStaffRole(
    db,
    principal,
    boardId,
    humanId,
    nextRole,
    Math.floor(Date.now() / 1000),
  );
  if (!result.ok) return adminErrorPage(result.error.code, principal, `/admin/boards/${boardId}/staff`);
  return redirectResponse(`/admin/boards/${boardId}/staff`);
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
      ? "You do not have authority for that administration action."
      : code === "not_found"
        ? "The requested Aura object was not found."
        : code === "conflict"
          ? "Aura refused that change. The target may have changed, or the change would violate an authorization or safety invariant."
          : "Aura could not complete the administration request.";
  return htmlPage(
    "Administration request failed",
    `<h1>Administration request failed</h1><div class="box error"><p>${escapeHtml(message)}</p></div><p><a href="${escapeHtml(returnPath)}">Return</a></p>`,
    { status, principal },
  );
}

function parseSortOrder(value: string | null): number {
  return value !== null && /^[0-9]{1,10}$/.test(value) ? Number(value) : Number.NaN;
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
