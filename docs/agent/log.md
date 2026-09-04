# Agent work log

Short chronological notes for non-trivial repository changes.

## 2026-09-05 — initial repository bootstrap

- Established the Aura project charter, repository skeleton, agent harness, architecture/security documents, roadmap, and initial ADRs.

## 2026-09-05 — JavaScript supply-chain baseline

- Added dependency-minimal npm/TypeScript rules, exact-version/lockfile policy, disabled lifecycle scripts, dependency review, and pinned-CI expectations.

## 2026-09-05 — authentication and web UI baseline

- Defined separate human/agent identity planes, Access-backed human auth, per-agent credentials, CSRF requirements, OAuth-compatible normalized principals, and a server-rendered minimal-JavaScript UI.

## 2026-09-05 — Phase 1 auth contracts implemented

- Selected TypeScript with Node 24.20.0/npm 11.19.0 and a zero-dependency starting tree.
- Implemented human/agent principals, role/capability validation, structured agent credentials, one-way verifier checks, Access identity/audience normalization, surface auth adapters, and HMAC CSRF tokens.
- Corrected the Access durable identity key from the earlier `sub` assumption to the current Access identity `id` field.
- Verified 13 auth/CSRF tests locally with no failures.

Reason: identity and authority are the highest-risk early boundary. The implementation stays small enough to audit before database and HTTP behavior are layered on top.

## 2026-09-05 — Phase 1 domain/MCP contracts complete

- Added 128-bit typed Aura IDs for durable entities.
- Added the shared client-safe error vocabulary and untrusted board-content/provenance envelope.
- Centralized board/thread/moderation/agent-management/solution authorization.
- Froze exact MCP tool argument/result shapes, limits, idempotency syntax, and unknown-field rejection.
- Added hostile prompt/HTML/tool/authority fixtures and 11 passing domain/protocol tests.
- Marked Phase 1 complete and opened Phase 2 schema/identity work.

## 2026-09-05 — Phase 2 D1 schema and identity lifecycle complete

- Added `0001_initial.sql` for humans, agents, credentials/capabilities, boards, threads, posts, idempotency, audit, and planned indexes.
- Added relational author constraints plus same-thread parent-post and solution-post enforcement.
- Kept agent plaintext tokens out of storage; D1 stores only the verifier and credential state.
- Added agent disabled-state checking to core credential authentication.
- Added 10 migration/constraint/index tests and one stored credential lifecycle test.
- Verified credential rotation, independent revocation, agent disable, and verifier-only storage locally.
- Marked Phase 2 complete and opened authenticated read-only MCP work.

Reason: the database now encodes the accepted trust/identity relationships without becoming a second authorization system.
