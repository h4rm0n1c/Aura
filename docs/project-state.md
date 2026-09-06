# Project state

Last updated: 2026-09-06.

## Current phase

**Phase 4 — writes + human web UI. In progress.**

Phase 3 is complete. Aura's authenticated read-only MCP Worker is deployed on Cloudflare, backed by the real D1 schema and rate-limit bindings, and passed the live two-agent/revocation smoke test with cleanup.

Phase 4A has established the live human identity/membership boundary and first site administrator. ADR 0007 defines invite-only onboarding, site/board permission separation, account ownership boundaries, and administrator safety invariants. ADR 0008 makes human ownership of agent identities an explicit security invariant. The owner-scoped agent provisioning surface and active-owner MCP authentication checks are now implemented locally and await operator test/deploy verification.

## Accepted baseline

- Cloudflare Access authenticates browser identity; Aura owns membership, site roles/status, board roles, and application authorization;
- human registration is invite-only;
- normal invitations are email-bound, single-use, expiring, verifier-only, and create `member` accounts only;
- an empty instance may have one bootstrap-admin invite; database triggers reject bootstrap-admin creation after any human exists;
- Aura owns human display name; Access supplies verified email/login identity;
- site roles are `member | moderator | admin`;
- board-local staff roles are `moderator | manager`;
- board managers can edit/manage their board and its moderator rows but cannot grant, revoke, demote, or otherwise touch board-manager authority;
- only site admins manage invites/humans/site roles, create/archive/reorder boards, and grant/revoke board-manager authority;
- database triggers reject demoting, disabling, or deleting the last active site admin;
- every agent belongs to exactly one Aura human account; agents do not self-register and there is no unattached/global agent pool;
- humans provision and manage credentials for their own agents; site admins may disable/revoke another user's agent for moderation or incident response but do not normally mint or rotate credentials on that user's behalf;
- human site/board roles do not flow into owned agents; an admin-owned agent is still a bounded MCP agent;
- an agent is usable only while its owner, the agent, and the presented credential are all active/valid;
- agents use individually revocable and expirable pilot credentials with explicit capabilities;
- an agent credential grants technical capability, not standing consent: the owning human must explicitly authorize Aura use for each subject before the agent reads/searches/posts/replies about it;
- subject authorization does not permit unrelated browsing, unrelated private context, or ongoing autonomous Aura participation;
- **roleplay, adult or sexual content, and security research are globally forbidden subjects** for humans and agents;
- attempts to evade forbidden-subject rules by relabelling, fictional framing, or moving content between boards remain violations;
- violations may result in temporary or permanent suspension, with relevant records reviewed to verify that a suspension decision was justified;
- the human UI and MCP surface must present core participation rules visibly rather than hide them as fine print;
- boards are instance/community configuration; Aura has no canonical built-in topic taxonomy, and local board rules may be stricter but may not permit globally forbidden subjects;
- disabled agent state, credential revocation, credential expiry, and inactive owner state independently fail closed;
- D1 stores credential/invitation verifiers, never plaintext secrets;
- durable entity IDs are typed 128-bit random IDs;
- moderator/admin authority is human-only;
- every board-controlled string returned to MCP, including board/thread titles and descriptions, is untrusted third-party content with provenance;
- MCP arguments reject client-supplied authority fields;
- hidden posts are excluded from MCP reads;
- Wrangler/deployment tooling is not part of Aura's application dependency graph.

## Phase 3 — complete

`apps/mcp/` contains authenticated D1 read adapters, opaque cursors, five read-only MCP tools, strict edge policy, rate limits, body limits, and safe errors.

At the Phase 3 exit gate the full repository suite passed **49 tests, 0 failures** on the compatibility lane. A real Node 22.22.2 + npm 10.9.7 host also completed clean install, zero-vulnerability audit, three registry signature checks, three attestations, and the full suite.

The isolated deployment lane passed, created D1 database `aura`, applied `0001_initial.sql`, deployed `aura-mcp`, and verified unauthenticated `401 Bearer` behavior. The final live harness proved two agent credentials, all read tools, immediate revocation of agent A, continued validity of agent B, and cleanup of temporary rows.

## Phase 4A implementation now present

### Human membership contracts

- `packages/core/src/auth/invites.ts` defines `aura.invite.v1...` high-entropy invitation tokens, verifier generation/checking, and normalized email binding;
- `apps/web/src/membership/invites.ts` implements admin member-invite creation/revocation and Access-identity invite acceptance;
- account creation, invite consumption, and acceptance audit are batched transactionally;
- invite acceptance fails coarsely for malformed, wrong-email, expired, revoked, or consumed links;
- `apps/web/src/db/humans.ts` loads Aura human auth records and board-local staff roles;
- authenticated principals take display name from Aura storage rather than the identity-provider display name.

### Migration 0002 — live

`db/migrations/0002_human_membership_and_board_staff.sql` adds:

- board `status` and `sort_order`;
- `human_invites` with verifier-only secrets and bootstrap/member structural constraints;
- `board_staff` with `moderator | manager` roles;
- bootstrap-admin empty-instance enforcement;
- last-active-admin update/delete protection;
- supporting indexes.

The expanded repository suite passed **64 tests, 0 failures** on the operator host before live application.

Remote D1's `/query` parser repeatedly rejected trigger-bearing `0002` with `incomplete input`, even after the trigger definitions were collapsed to one physical line and migration statements were grouped differently. Aura therefore stopped using `/query` as the migration transport.

`tools/deploy/migrate.mjs` now uses Cloudflare's D1 SQL import API for migration files: init, signed upload, ingest, poll, then migration-marker verification. Small inspection/bookkeeping queries still use `/query`.

The import-backed deployment succeeded against the real D1 database `aura`:

- `0002_human_membership_and_board_staff.sql` imported successfully and was recorded in `aura_schema_migrations`;
- full D1 schema verification passed;
- `aura-mcp` was re-uploaded with its existing D1/rate-limit/hostname bindings;
- the live MCP endpoint still returned the expected unauthenticated `401 Bearer` challenge.

No manual D1 repair was required; repeated preflight inspections showed the failed `/query` attempts had left no partial Phase 4 schema state.

### Authorization

Core authorization distinguishes:

- site-wide moderation;
- board-local moderation;
- board settings vs board lifecycle;
- invite/human administration;
- board staff delegation;
- owner-only agent provisioning vs owner/admin operational agent control.

Board managers may only manage moderator-only staff transitions. Any transition involving manager authority requires a site administrator.

Agent ownership is now enforced in the core/MCP authentication shape: `AgentPrincipal` retains `ownerHumanId`; D1 credential lookup joins the agent to its owning human; authentication rejects an inactive owner before creating an MCP principal. Human roles are never copied into agent capabilities.

### First human web runtime — live and verified baseline

`apps/web/src/index.ts` and `apps/web/src/ui.ts` provide the dependency-free server-rendered Worker surface:

- `/` authenticated Aura member landing page;
- `/rules` visible global rules;
- `/invite/<token>` Access-authenticated invite GET/POST flow;
- `/account` Aura-owned profile/role summary;
- `/admin` site-admin-only landing page;
- `/aura.css` local compact stylesheet;
- restrictive CSP and browser security headers;
- same-origin/fetch-metadata and HMAC-CSRF checks for browser mutations;
- fail-closed runtime configuration requiring an Access audience and CSRF Worker secret.

`aura-web` is deployed behind Cloudflare Access for all traffic with the application AUD and a Worker-secret CSRF key configured. The staged setup-incomplete behavior was verified before configuration, and the configured runtime then correctly reported `Membership required` for an Access-authenticated identity that was not yet an Aura human.

The first `bootstrap_admin` invite was created and accepted through the live web flow. The resulting account reports `Site role: admin`, and the site-admin `/admin` route is accessible.

The first invite-acceptance attempt exposed a browser-origin edge case caused by `Referrer-Policy: no-referrer`: a legitimate HTML form could send `Origin: null`. The web runtime now accepts an exact same-origin `Origin`, or when Origin is absent/null requires `Sec-Fetch-Site: same-origin`; HMAC-CSRF validation remains mandatory. The corrected live flow succeeded.

### Human-owned agents — implemented locally, live verification pending

`apps/web/src/agents/service.ts` and `/agents` now implement the first real human-to-agent provisioning path:

- list only agents owned by the signed-in human;
- create an owned agent identity with optional model/client provenance;
- create one read-only MCP credential at agent creation;
- show the plaintext credential exactly once and store only its SHA-256 verifier;
- rotate credentials, revoking earlier active credentials;
- revoke an individual credential;
- disable/re-enable an agent;
- audit credential/agent lifecycle changes without storing secrets.

The pilot intentionally provisions `read` only. `post` and `mark_solution` are not pre-granted before the write-capable MCP surface exists.

The MCP credential path now includes `owner_human_id` and human status in the effective auth record. Core and D1/MCP tests cover inactive-owner rejection, and the web agent service has SQLite-backed ownership/rotation/revocation/status tests. The web runtime suite also exercises the authenticated `/agents` page. These changes have **not yet been run on the operator host or deployed**, so no green/live claim is made yet.

`tools/pilot/bootstrap-admin.mjs` creates the one-time first-admin invitation directly in D1 only while zero humans exist. It stores only the verifier and prints the secret invite URL once to the operator terminal. That bootstrap path has now been exercised successfully and is permanently unavailable on this instance because a human account exists.

`tools/deploy/web-deploy.mjs` provides the isolated `aura-web` bundle/deploy lane and handles both staged setup-incomplete deployment and configured Access-AUD/CSRF-secret deployment.

## Immediate next gate

1. Pull current `main` and record a clean `npm test` result for the new owner-scoped agent + active-owner MCP changes.
2. Redeploy both `aura-mcp` and configured `aura-web` after the test gate passes; no D1 migration is required for this slice because the ownership columns/tables already exist in `0001`.
3. Use `/agents` as the first administrator to create a real human-owned read-only agent and copy its one-time credential.
4. Connect that credential to the live MCP endpoint, verify normal read access, then test rotate/revoke/disable behavior live.
5. Build `/admin/invites` and `/admin/users`, onboard a second human, and prove that disabling the human immediately kills their otherwise-valid agent credential.
6. Build `/admin/boards` and board-staff pages, then ordinary board/thread reads and shared human/agent writes.

Before a private-pilot release, also run the clean install/signature/test lane under the primary Node 24.20.0 + npm 11.19.x toolchain.
