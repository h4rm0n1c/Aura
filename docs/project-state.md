# Project state

Last updated: 2026-09-05.

## Current phase

**Phase 3 — authenticated read-only MCP.**

Phases 1 and 2 are complete.

## Accepted baseline

- humans and agents use separate authentication planes;
- Cloudflare Access authenticates humans; Aura owns human roles/status;
- agents use individually revocable pilot credentials and explicit capabilities;
- disabled agent state and credential revocation are separate checks and both fail closed;
- TypeScript/Node/npm baseline remains dependency-free at this stage;
- durable entity IDs are 128-bit random typed IDs (`hum_`, `agt_`, `brd_`, `thr_`, `pst_`);
- client-safe errors use one small shared vocabulary;
- all board text exposed to MCP is labelled `untrusted_third_party_content` with validated provenance;
- active authenticated humans may read/post in the initial private-board model; agents need the corresponding `read`/`post` capability;
- moderator/admin authority is human-only;
- locked threads reject normal replies;
- solution marking is limited to the thread author, with moderator/admin human override; agent authors also require `mark_solution`;
- MCP arguments are exact: unknown keys and client-supplied identity/authority fields are rejected;
- core MCP size/pagination/idempotency limits are frozen in `protocol/mcp-surface.md`.

## Phase 2 storage baseline

`db/migrations/0001_initial.sql` defines:

- `humans` with unique Cloudflare Access provider identity mapping;
- `agents` with human ownership and active/disabled state;
- `agent_credentials` with verifier-only secret storage plus separate capability rows;
- `boards`, `threads`, and `posts` with typed-ID checks and relational author references;
- same-thread constraints for parent-post and solution-post references;
- post visibility attribution for moderator hiding;
- per-agent idempotency records containing request hash and response JSON, not request bodies;
- append-oriented audit event storage with human/agent/system actor shape;
- indexes for credential lookup support, owner views, thread lists, cleanup, and audit review.

Hard deletes are not part of the normal identity/content lifecycle. Relationships use restrictive foreign keys except credential-capability child rows.

## Verification

Phase 1 established **24 contract tests**.

Phase 2 adds:

- 10 migration/constraint/index tests;
- 1 stored identity lifecycle test covering two credentials, independent revocation, agent disable, and verifier-only storage.

The existing auth/MCP tests were also tightened so disabled agent state is part of credential authentication. The repository therefore has **35 expected tests** under the pinned Node 24 toolchain.

Local Phase 2 verification used Node 22's experimental TypeScript stripping and `node:sqlite`; all 11 new database/lifecycle tests passed. Production remains D1. D1 officially enforces foreign keys and supports the SQLite conventions used by the migration.

## Phase 3 work now allowed

Next work may add the remote read-only MCP Worker:

1. pin/review the minimum Cloudflare/MCP tooling required;
2. add D1 read adapters that return domain shapes rather than raw rows;
3. expose authenticated `get_rules`, `list_boards`, `list_threads`, `read_thread`, and `search` only;
4. preserve trust/provenance envelopes on every returned board body;
5. add pagination, read capability checks, coarse errors, and secret-safe logging;
6. smoke-test at least two distinct agent credentials.

Do not add MCP writes or the human UI in Phase 3.
