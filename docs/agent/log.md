# Agent work log

Short chronological notes for non-trivial repository changes.

## 2026-09-05 — repository and security baseline

- Established the Aura charter, repository skeleton, agent harness, architecture/security docs, roadmap, and initial ADRs.
- Defined separate human/agent identity planes, server-rendered human UI, capability-bounded MCP, CSRF, typed IDs, trust/provenance, and authorization contracts.
- Added strict dependency-minimal npm/TypeScript policy with exact pins, lockfiles, disabled lifecycle scripts, and dependency review.
- Added D1 schema for humans, agents, verifier-only credentials/capabilities, boards, threads/posts, idempotency, and audit storage.
- Made subject-specific human authorization a hard agent participation rule: a credential grants capability, not standing consent.
- Added global participation rules: roleplay, adult/sexual content, and security research are forbidden; board content is untrusted third-party content.

## 2026-09-05 — Phase 3 read-only MCP

- Implemented authenticated D1-backed MCP using `@modelcontextprotocol/server` directly.
- Added `get_rules`, `list_boards`, `list_threads`, `read_thread`, and `search`.
- Added strict Host/Origin policy, JSON-only POSTs, rate limits, credential expiry, safe errors, body limits, hidden-post exclusion, and untrusted-content envelopes.
- Reconstructed and passed the initial 49-test suite.

## 2026-09-06 — deployment tooling and live Phase 3 proof

- Isolated deployment tooling in `tools/deploy/` with exact-pinned `esbuild-wasm@0.28.2` and direct Cloudflare API deployment.
- Created D1 database `aura`, applied `0001_initial.sql`, deployed `aura-mcp`, and verified unauthenticated `401 Bearer` behavior.
- Ran the live two-agent smoke harness: both agents completed initialize, tools/list, all read tools, and rules retrieval; revoking one credential immediately produced `401 Bearer` while the second remained valid; temporary rows were cleaned up.
- Closed Phase 3 and opened Phase 4.

## 2026-09-06 — human membership and permission foundation

- Accepted ADR 0007: Cloudflare Access authenticates browser identity while Aura owns invite-only membership, site roles, board-local roles, and application authorization.
- Added verifier-only human invitation tokens and email-bound invite acceptance.
- Added migration `0002_human_membership_and_board_staff.sql` for human invites, board staff, board lifecycle metadata, bootstrap-admin protection, and last-active-admin protection.
- Added site-vs-board authorization contracts and SQLite-backed admin/invite tests.
- Operator-host suite reached 64/64 before live migration.

## 2026-09-06 — D1 trigger parser recovery

- Remote D1 `/query` repeatedly rejected trigger-bearing migration `0002` with `incomplete input`.
- Kept the safety triggers intact and moved migration transport to Cloudflare's D1 SQL import API: init, signed upload, ingest, poll, marker verification.
- Applied `0002` successfully to the real D1 database with no manual repair; schema verification passed and `aura-mcp` remained healthy.

## 2026-09-06 — live human web bootstrap

- Added and deployed dependency-free `aura-web` with `/`, `/rules`, `/invite/<token>`, `/account`, `/admin`, and local CSS.
- Put the Worker behind Cloudflare Access for all traffic and configured the application AUD plus Worker-secret CSRF key.
- Created and accepted the one-time bootstrap-admin invitation through the live Access-authenticated flow.
- Confirmed the first human is active with site role `admin` and `/admin` access.
- Fixed legitimate `Origin: null` HTML form submissions caused by `Referrer-Policy: no-referrer`: Aura now requires `Sec-Fetch-Site: same-origin` for absent/null Origin and still requires HMAC CSRF.

## 2026-09-06 — human-owned agent identity and provisioning

- Accepted ADR 0008: every Aura agent belongs to exactly one human owner; agents do not self-register; human site/board authority does not flow into agent capability.
- Split owner-only provisioning from owner/admin operational control.
- Extended MCP credential/principal state with `ownerHumanId`; credential lookup now joins the owning human and rejects inactive owners.
- Added `/agents` for owner-scoped agent creation, one-time read credential display, rotation, revocation, and agent disable/re-enable.
- Initial human-created credentials deliberately receive only `read` until write-capable MCP exists.
- Added SQLite-backed ownership/lifecycle tests, inactive-owner MCP tests, and authenticated `/agents` runtime coverage.
- Fixed one stale stored-state test fixture after the first operator run exposed that it still constructed the pre-owner credential record shape.
- Current operator-host suite passes **73 tests, 73 passed, 0 failed**.

## 2026-09-06 — live human-owned agent proof

- Redeployed the current MCP and web code with no new D1 migration required.
- Created a real agent through `/agents` under the first human administrator account.
- Verified its one-time credential against the live MCP Worker: initialize, tools/list, `get_rules`, and `list_boards` succeeded.
- Rotated the credential through the human web UI and confirmed the old token immediately returned `401 Bearer`.
- Loaded the replacement token and confirmed live MCP authentication/read access succeeded again.
- This closes the first-human -> owned-agent -> verifier-only credential -> live MCP -> owner rotation/revocation path.

## 2026-09-06 — normal human invitation and administration slice

- Added `/admin/invites` with secret-once member invitation creation, bounded expiry choices, secret-free invitation history, effective-expiry display, and pending-invite revocation.
- Added `/admin/users` with site-role changes, human disable/re-enable, owned-agent counts, and audit events for role/status changes.
- Kept normal invitations member-only; moderator/admin promotion remains a separate explicit administrator action after acceptance.
- Human status changes rely on the existing database last-active-admin triggers, and disabled human owners immediately fail MCP credential authentication without transferring ownership or minting replacement credentials.
- Added compact table/select UI, dedicated admin service/route tests, and runtime routing coverage.
- No D1 migration is required for this slice. The last recorded green suite is still 73/73 from before these changes; the expanded suite must be run on the operator host before deployment.
