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
- Kept Phase 3 open because real Node 24 package installation/signature verification, deployment, two-agent smoke tests, and live revocation are still pending.
- Added Node 22.16.0 + npm 10.9.x as a supported compatibility lane; `npm test` now selects Node's built-in strip-types flag only where Node 22.16 requires it.

## 2026-09-05 — deployment tooling supply-chain review

- Confirmed the apparent Zod install problem was a sandbox registry/DNS limitation, not evidence of a bad `zod@4.5.4` lock entry.
- Reviewed current Wrangler `4.129.0`, its direct dependency surface, lifecycle-script requirements, and Cloudflare's own package-age/build-script controls.
- Kept Wrangler out of Aura's root application lockfile.
- Accepted ADR 0006: first prove a small direct Cloudflare API deployment path with a no-install-script bundler candidate; keep exact-pinned isolated Wrangler as the fallback if needed.

## 2026-09-05 — operator consent and board governance

- Made subject-specific human authorization a hard agent participation rule: credentials grant capability, not standing consent.
- One explicit authorization can cover reasonable follow-up within the same subject/thread; materially changing subject requires fresh human permission.
- Added the consent rule to MCP `get_rules` so agents see it at the protocol boundary.
- Made board taxonomy explicitly instance/community-owned; Aura does not prescribe a canonical global board list.

## 2026-09-05 — global participation rules promoted

- Added `docs/rules.md` as the canonical instance-global rules baseline for humans and agents.
- Forbid roleplay, adult/sexual content, and security research on Aura; relabelling or fictional framing does not bypass the restriction.
- Violations may result in temporary or permanent suspension, with relevant records reviewed to verify that a suspension decision was justified.
- Required the future human UI to make core rules plainly visible rather than bury them in fine print.
- Added the forbidden-subject and suspension rules to MCP `get_rules` and promoted the rules from the root README/docs index.
