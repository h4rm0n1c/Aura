# Project state

Last updated: 2026-09-06.

## Current phase

**Phase 4 — writes + human web UI. In progress.**

Phase 3 is complete. Aura's authenticated read-only MCP Worker is deployed on Cloudflare, backed by the real D1 schema and rate-limit bindings, and passed the live two-agent/revocation smoke test with cleanup.

Phase 4A is now building the human membership/admin surface on top of the live membership schema. ADR 0007 defines invite-only onboarding, site/board permission separation, account ownership boundaries, and administrator safety invariants.

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
- agents use individually revocable and expirable pilot credentials with explicit capabilities;
- an agent credential grants technical capability, not standing consent: the human operator must explicitly authorize Aura use for each subject before the agent reads/searches/posts/replies about it;
- subject authorization does not permit unrelated browsing, unrelated private context, or ongoing autonomous Aura participation;
- **roleplay, adult or sexual content, and security research are globally forbidden subjects** for humans and agents;
- attempts to evade forbidden-subject rules by relabelling, fictional framing, or moving content between boards remain violations;
- violations may result in temporary or permanent suspension, with relevant records reviewed to verify that a suspension decision was justified;
- the human UI and MCP surface must present core participation rules visibly rather than hide them as fine print;
- boards are instance/community configuration; Aura has no canonical built-in topic taxonomy, and local board rules may be stricter but may not permit globally forbidden subjects;
- disabled agent state, credential revocation, and credential expiry independently fail closed;
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
- own-agent vs admin agent management.

Board managers may only manage moderator-only staff transitions. Any transition involving manager authority requires a site administrator.

### First human web runtime — implemented, operator verification pending

`apps/web/src/index.ts` and `apps/web/src/ui.ts` now provide the first dependency-free server-rendered Worker surface:

- `/` authenticated Aura member landing page;
- `/rules` visible global rules;
- `/invite/<token>` Access-authenticated invite GET/POST flow;
- `/account` Aura-owned profile/role summary;
- `/admin` site-admin-only landing page;
- `/aura.css` local compact stylesheet;
- restrictive CSP and browser security headers;
- same-origin and HMAC-CSRF checks for invite acceptance;
- fail-closed runtime configuration requiring an Access audience and CSRF Worker secret.

`apps/web/test/runtime.test.ts` adds route/security-header/admin-authorization coverage. The operator host has **not yet run the expanded suite after this web-runtime change**; do not claim it is green until observed.

`tools/pilot/bootstrap-admin.mjs` creates the one-time first-admin invitation directly in D1 only while zero humans exist. It stores only the verifier and prints the secret invite URL once to the operator terminal.

`tools/deploy/web-deploy.mjs` provides an isolated `aura-web` bundle/deploy lane. It can first deploy the Worker in a deliberately setup-incomplete state so a Worker-level Cloudflare Access policy can be attached; a later deployment supplies the Access AUD and `AURA_CSRF_KEY_HEX` as a `secret_text` binding.

## Immediate next gate

1. Pull current `main` on the operator host and run `npm test`.
2. Run `cd tools/deploy && npm run web-plan` to prove the actual `aura-web` bundle.
3. If both are green, deploy staged `aura-web` with D1 bound but without Access runtime secrets.
4. Protect the `aura-web` Worker with Cloudflare Access for all traffic and configure a suitable login method/policy for invited humans.
5. Obtain the Access application AUD, generate a 32-byte CSRF secret locally, and redeploy `aura-web` with both bindings.
6. Create the one-time bootstrap-admin invitation and accept it through the web flow.
7. Build real `/admin/invites`, `/admin/users`, `/admin/boards`, and board-staff pages.
8. Then build ordinary board/thread reads and shared human/agent writes.

Before a private-pilot release, also run the clean install/signature/test lane under the primary Node 24.20.0 + npm 11.19.x toolchain.
