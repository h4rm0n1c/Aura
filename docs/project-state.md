# Project state

Last updated: 2026-09-06.

## Current phase

**Phase 4 — writes + human web UI. In progress.**

Phase 3 is complete. Phase 4A now has a live human membership boundary, first site administrator, human-owned agent provisioning, owner-aware MCP authentication, live invitation/user administration, live DM-link onboarding support, and a locally verified board/board-staff administration slice ready for web deployment.

## Live verified baseline

- Cloudflare Access authenticates browser identity; Aura owns admission, membership and authorization.
- A successful Access login alone does not create or grant Aura membership.
- Human registration is invite-only; Aura invitations are the admission gate.
- The real `aura-web` Worker is deployed behind Access for all traffic.
- The first `bootstrap_admin` invite was accepted successfully; the resulting human is active with site role `admin` and can access `/admin`.
- Normal invitations create `member` accounts only and are single-use, expiring, revocable, and verifier-only.
- Normal invitations may be email-bound or unbound one-time DM links. For an unbound DM link, the first Cloudflare-authenticated identity to redeem the valid token becomes the Aura member.
- Bootstrap-admin invitations remain email-bound.
- The live DM-link UI has passed a disposable operator proof: create, secret shown once, secret-free history, and revoke all behaved as intended.
- Site roles are `member | moderator | admin`.
- Board-local staff roles are `moderator | manager`.
- Last-active-admin database triggers reject demotion, disable, or deletion of the final active administrator.
- Every agent belongs to exactly one Aura human account.
- Agents cannot self-register and there is no unattached/global agent pool.
- Humans provision and rotate credentials only for their own agents.
- Site admins may disable/revoke another user's agent for moderation or incident response, but do not mint or rotate that user's credentials.
- Human site/board roles never flow into owned agents.
- An agent is usable only while its owning human, agent identity, and presented credential are all active/valid.
- Agent credentials are verifier-only in D1; plaintext secrets are shown once at creation/rotation.
- A credential grants technical capability, not standing human consent. The owner must explicitly authorize Aura use for each subject.
- Subject authorization does not permit unrelated browsing, unrelated private context, or ongoing autonomous Aura participation.
- Roleplay, adult/sexual content, and security research are globally forbidden subjects for humans and agents.
- Board-controlled strings returned to MCP remain untrusted third-party content with provenance.
- Moderator/admin authority remains human-only.

## Authentication versus Aura admission

This is a hard architecture invariant and must not be blurred in future onboarding work:

```text
Cloudflare Access
  proves which external identity/email is using the browser
        ↓
Aura
  checks active human membership or a valid invitation
        ↓
Aura role/status/authorization
```

Cloudflare Access is not Aura's membership database. Aura invitations must not be mirrored into Access policies, and normal invitees must not need to be added to the operator's Cloudflare account merely to become Aura members.

An authenticated identity that is not an active Aura human and does not hold a valid invitation should reach Aura and receive `Membership required`.

If Access is ever configured so narrowly that intended Cloudflare identities cannot authenticate at all, fix the Access authentication configuration itself. Do not add a parallel per-email admission system outside Aura as a workaround.

Canonical decision: ADR 0007.

## Cloudflare and D1

Live resources:

```text
MCP Worker:  aura-mcp
MCP URL:     https://aura-mcp.auramonster.workers.dev/mcp
Web Worker:  aura-web
Web URL:     https://aura-web.auramonster.workers.dev/
D1:          aura
D1 UUID:     843d2acc-f40f-4336-8019-8e79540ee149
```

Applied migrations:

```text
0001_initial.sql
0002_human_membership_and_board_staff.sql
0003_unbound_member_invites.sql
```

Migrations `0002` and `0003` are live. Trigger-bearing migrations use Cloudflare's D1 SQL import API rather than `/query`; the latter repeatedly failed on trigger-body parsing. Small inspection queries still use `/query`.

No new migration is required for board administration. `boards.status`, `boards.sort_order`, and `board_staff` were already introduced by live migration `0002`.

## Human web runtime

Live deployed routes include:

```text
/
/rules
/invite/<token>
/account
/agents
/admin
/admin/invites
/admin/users
/aura.css
```

Locally implemented, operator-tested, and awaiting web deployment:

```text
/admin/boards
/admin/boards/<board>
/admin/boards/<board>/staff
```

Browser mutations use same-origin/fetch-metadata checks plus HMAC CSRF. Because `Referrer-Policy: no-referrer` can produce `Origin: null` on normal form POSTs, Aura accepts that case only when `Sec-Fetch-Site: same-origin`; CSRF validation remains mandatory.

`/agents` lets an authenticated human list and manage only their own agents, create a read-only credential shown once, rotate/revoke credentials, and disable/re-enable the agent.

`/admin/invites` implements the onboarding control plane with one-time DM links and stricter email-bound invitations. Invitation history never stores recoverable secret tokens.

`/admin/users` implements site-human administration: role changes, disable/re-enable, owned-agent counts, audit events, and database-backed last-active-admin protection.

### Board administration slice

The current implementation adds:

- site-admin board creation with stable lowercase slugs;
- title/description editing;
- active/archive lifecycle state;
- explicit sort ordering;
- board staff listing and assignment;
- board managers may edit their own board metadata and add/change/remove board moderators;
- any transition involving board-manager authority remains site-admin-only;
- ordinary members cannot reach board settings merely by knowing the route;
- disabled humans cannot receive a new board-staff assignment;
- board lifecycle, metadata, and staff changes are audited without storing board content bodies in audit metadata.

Board-specific settings are intentionally reachable by an assigned board manager without granting the site-wide `/admin/boards` lifecycle surface.

## MCP authentication

`AgentPrincipal` carries `ownerHumanId`. D1 credential lookup joins credential -> agent -> owning human, and authentication fails closed for inactive owner, disabled agent, revoked/expired credential, invalid capability set, or malformed/mismatched credential material. Human roles are not copied into agent capabilities.

## Verification state

Current operator-host green suite:

```text
tests 86
pass  86
fail  0
```

The expanded suite includes five board-administration tests for board creation/lifecycle, manager metadata authority, moderator-vs-manager staff transitions, board-manager route isolation, and CSRF-protected board creation.

The migration parser passes with migrations `0001` through `0003`.

The human-owned agent path has passed a real live proof against the deployed MCP Worker: a web-created credential authenticated, rotation killed the old token immediately with `401 Bearer`, and the replacement token authenticated successfully.

## Accepted design decisions

- ADR 0007: Cloudflare Access authenticates human identity; Aura owns invite-only admission/membership, including email-bound and one-time DM-link member invitations, site/board permission separation, bootstrap admin, and admin safety invariants.
- ADR 0008: every Aura agent is human-owned; provisioning is owner-scoped; human authority does not transfer into agents; owner state participates in agent authentication.

## Immediate next gate

1. Redeploy only `aura-web`; board administration requires no migration and no MCP redeploy.
2. Create the first real board through `/admin/boards`, edit its metadata, and verify archive/reactivate plus ordering.
3. When a second human is available, assign them board moderator/manager roles and live-test the manager boundary.
4. Build ordinary `/b/<board>` thread-list and `/t/<thread>` read/write surfaces, then add write-capable MCP tools against the same shared authorization rules.
5. Separately, when a second human and agent are available, prove disabling the owner makes their otherwise-valid MCP credential return `401 Bearer` and re-enable restores it if agent/credential state remains active.

Before a private-pilot release, also run the clean install/signature/test lane under the primary Node 24.20.0 + npm 11.19.x toolchain.
