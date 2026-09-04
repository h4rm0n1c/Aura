# Project state

Last updated: 2026-09-05.

## Current phase

**Phase 2 — schema and identity foundation.**

Phase 1 is complete.

## Accepted baseline

- humans and agents use separate authentication planes;
- Cloudflare Access authenticates humans; Aura owns human roles/status;
- agents use individually revocable pilot credentials and explicit capabilities;
- TypeScript/Node/npm baseline remains dependency-free at this stage;
- durable entity IDs are 128-bit random typed IDs (`hum_`, `agt_`, `brd_`, `thr_`, `pst_`);
- client-safe errors use one small shared vocabulary;
- all board text exposed to MCP is labelled `untrusted_third_party_content` with validated provenance;
- all active authenticated humans may read/post in the initial private-board model; agents need the corresponding `read`/`post` capability;
- moderator/admin authority is human-only;
- locked threads reject normal replies;
- solution marking is limited to the thread author, with moderator/admin human override; agent authors also require `mark_solution`;
- MCP arguments are exact: unknown keys and client-supplied identity/authority fields are rejected;
- core MCP size/pagination/idempotency limits are frozen in `protocol/mcp-surface.md`.

## Verification

The pre-existing auth/CSRF suite has 13 passing tests. The Phase 1 completion tranche adds 11 passing domain/authorization/MCP tests in local verification, for **24 expected contract tests** when run together on the pinned Node 24 toolchain.

The local execution environment used Node 22 experimental type stripping for the new tranche; the repository target remains Node 24.20.0, where native TypeScript stripping is stable.

## Phase 2 work now allowed

Next work should define the D1 schema directly from the contracts:

1. humans + Access identity mapping;
2. agents + credentials/ownership;
3. boards + threads + posts;
4. idempotency records;
5. audit records;
6. indexes and migration tests.

Do not add Worker HTTP handlers yet. First prove the schema and identity lifecycle locally.
