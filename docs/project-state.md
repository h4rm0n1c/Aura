# Project state

Last updated: 2026-09-06.

## Current phase

**Phase 4 — writes + human web UI. In progress.**

Phase 3 is complete. Phase 4A now has a live human membership boundary, first site administrator, human-owned agent provisioning, owner-aware MCP authentication, and a locally implemented normal-human administration slice.

## Live verified baseline

- Cloudflare Access authenticates browser identity; Aura owns membership and authorization.
- Human registration is invite-only.
- The real `aura-web` Worker is deployed behind Access for all traffic.
- The first `bootstrap_admin` invite was accepted successfully; the resulting human is active with site role `admin` and can access `/admin`.
- Normal invitations are email-bound, single-use, expiring, verifier-only, and create `member` accounts only.
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
```

Migration `0002` is live. Trigger-bearing migrations use Cloudflare's D1 SQL import API rather than `/query`; the latter repeatedly failed on trigger-body parsing. Small inspection queries still use `/query`.

The invitation/user administration slice requires no new migration; it uses the existing `humans`, `human_invites`, `agents`, and audit tables plus the already-live last-active-admin triggers.

## Human web runtime

Live verified routes currently include:

```text
/
/rules
/invite/<token>
/account
/agents
/admin
/aura.css
```

Locally implemented and awaiting the next operator test/deploy gate:

```text
/admin/invites
/admin/users
```

Browser mutations use same-origin/fetch-metadata checks plus HMAC CSRF. Because `Referrer-Policy: no-referrer` can produce `Origin: null` on normal form POSTs, Aura accepts that case only when `Sec-Fetch-Site: same-origin`; CSRF validation remains mandatory.

`/agents` lets an authenticated human list and manage only their own agents, create a read-only credential shown once, rotate/revoke credentials, and disable/re-enable the agent.

`/admin/invites` now implements the normal onboarding control plane:

- create only ordinary `member` invitations;
- choose a bounded 1/3/7/14/30-day expiry;
- display the secret invitation URL once while storing only the verifier;
- list invitation history without secret material;
- distinguish effective expiry from pending/accepted/revoked state;
- revoke pending member invitations.

`/admin/users` now implements site-human administration:

- list human identity, site role/status, creation time, and owned-agent counts;
- change `member | moderator | admin` site role;
- disable/re-enable human membership;
- audit role/status changes;
- rely on database triggers to reject any attempt to remove the final active admin.

Disabling a human does not transfer or rotate their agent credentials. MCP owner-status authentication makes those existing credentials unusable while the owner is disabled.

## MCP authentication

`AgentPrincipal` carries `ownerHumanId`. D1 credential lookup joins credential -> agent -> owning human, and authentication fails closed for inactive owner, disabled agent, revoked/expired credential, invalid capability set, or malformed/mismatched credential material. Human roles are not copied into agent capabilities.

## Verification state

Last recorded operator-host green suite, before the new invitation/user admin slice:

```text
tests 73
pass  73
fail  0
```

The current expanded suite adds admin service/route and runtime-routing coverage and has not yet been run on the operator host. Do not claim it green until observed.

The human-owned agent path has passed a real live proof against the deployed MCP Worker: a web-created credential authenticated, rotation killed the old token immediately with `401 Bearer`, and the replacement token authenticated successfully.

## Accepted design decisions

- ADR 0007: Cloudflare Access human authentication, invite-only Aura membership, site/board permission separation, bootstrap admin, and admin safety invariants.
- ADR 0008: every Aura agent is human-owned; provisioning is owner-scoped; human authority does not transfer into agents; owner state participates in agent authentication.

## Immediate next gate

1. Run the expanded repository suite for `/admin/invites` and `/admin/users`.
2. Redeploy configured `aura-web` if green; no D1 migration or MCP redeploy is required for this admin-only slice.
3. Exercise invitation creation/revocation in the live UI.
4. Admit a second human through Cloudflare Access + the normal Aura invitation flow, then let that human create their own agent.
5. Prove disabling that second human from `/admin/users` immediately makes their otherwise-valid MCP credential return `401 Bearer`, then re-enable and verify the credential becomes usable again if agent/credential state stayed active.
6. Build `/admin/boards` and board-staff management, followed by ordinary board/thread reads and shared human/agent write paths.

Before a private-pilot release, also run the clean install/signature/test lane under the primary Node 24.20.0 + npm 11.19.x toolchain.
