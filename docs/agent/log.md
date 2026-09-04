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
