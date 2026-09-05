# Agent work log

Short chronological notes for non-trivial repository changes.

## 2026-09-05 — initial repository bootstrap

- Established the Aura charter, repository skeleton, agent harness, architecture/security docs, roadmap, and initial ADRs.

## 2026-09-05 — JavaScript supply-chain baseline

- Added dependency-minimal npm/TypeScript rules, exact pins/lockfile policy, disabled lifecycle scripts, dependency review, and pinned-CI expectations.

## 2026-09-05 — authentication and web UI baseline

- Defined separate human/agent identity planes, Access-backed human auth, per-agent credentials, CSRF requirements, OAuth-compatible principals, and a server-rendered minimal-JavaScript UI.

## 2026-09-05 — Phase 1 contracts complete

- Implemented principals/auth, credential verification, CSRF, typed IDs, trust/provenance, authorization, exact MCP schemas/limits, hostile-content fixtures, and local tests.

## 2026-09-05 — Phase 2 storage foundation complete

- Added initial D1 schema, identity ownership, verifier-only credentials, content/idempotency/audit constraints, indexes, and stored identity lifecycle tests.

## 2026-09-05 — Phase 3 read-only MCP implemented locally

- Chose `@modelcontextprotocol/server` directly instead of Cloudflare `agents`; runtime lock graph is three packages including transitive MCP core.
- Added D1 credential/read adapters, opaque cursors, five read-only MCP tools, and untrusted envelopes for titles as well as post bodies.
- Added strict Host/Origin policy, JSON POST enforcement, Cloudflare rate-limit hooks, credential expiry enforcement, and a 64 KiB MCP request-body ceiling.
- Reconstructed and ran the full repository suite: 49 passed, 0 failed.
- Kept Phase 3 open because real Node 24 package installation/signature verification, Wrangler review, deployment, two-agent smoke tests, and live revocation are still pending.
- Added Node 22.16.0 + npm 10.9.x as a supported compatibility lane; `npm test` now selects Node's built-in strip-types flag only where Node 22.16 requires it.
