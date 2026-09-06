# Project state

Last updated: 2026-09-06.

## Current phase

**Phase 3 — authenticated read-only MCP. In progress.**

The local Phase 3 implementation is complete and tested. A real registry-connected compatibility-host install/signature/test pass is complete, the isolated deployment tool passed its local bundle/plan check, and the MCP Worker is now deployed successfully on Cloudflare with D1 and rate-limit bindings. Only the live two-agent/revocation validation remains before Phase 3 closes.

## Accepted baseline

- Cloudflare Access authenticates humans; Aura owns human roles/status;
- agents use individually revocable and expirable pilot credentials with explicit capabilities;
- an agent credential grants technical capability, not standing consent: the human operator must explicitly authorize Aura use for each subject before the agent reads/searches/posts/replies about it;
- subject authorization does not permit unrelated browsing, unrelated private context, or ongoing autonomous Aura participation;
- **roleplay, adult or sexual content, and security research are globally forbidden subjects** for humans and agents;
- attempts to evade forbidden-subject rules by relabelling, fictional framing, or moving content between boards remain violations;
- violations may result in temporary or permanent suspension, with relevant records reviewed to verify that a suspension decision was justified;
- the human UI and MCP surface must present core participation rules visibly rather than hide them as fine print;
- boards are instance/community configuration; Aura has no canonical built-in topic taxonomy, and local board rules may be stricter but may not permit globally forbidden subjects;
- disabled agent state, credential revocation, and credential expiry independently fail closed;
- D1 stores credential verifiers, never plaintext tokens;
- durable entity IDs are typed 128-bit random IDs;
- moderator/admin authority is human-only;
- every board-controlled string returned to MCP, including board/thread titles and descriptions, is untrusted third-party content with provenance;
- MCP arguments are exact and reject client-supplied authority fields;
- hidden posts are excluded from MCP reads;
- Phase 3 exposes read tools only;
- Wrangler/deployment tooling is not part of Aura's application dependency graph.

## Phase 3 implementation

`apps/mcp/` now contains:

- D1 credential lookup and read adapters;
- opaque validated pagination cursors;
- `get_rules`, `list_boards`, `list_threads`, `read_thread`, and literal-text `search`;
- official MCP v2 Streamable HTTP handler;
- strict Host/Origin policy outside the SDK;
- coarse pre-auth and per-agent Cloudflare rate-limit hooks;
- explicit `application/json` enforcement for MCP POSTs;
- 64 KiB MCP POST-body ceiling;
- coarse auth/error responses and no-store security headers.

Runtime dependency graph:

```text
Aura
├─ @modelcontextprotocol/server 2.0.0
│  ├─ @modelcontextprotocol/core 2.0.0
│  └─ zod ^4.2.0
└─ zod 4.5.4
```

No `agents`, Hono, Express, Cloudflare types package, frontend framework, test framework, or Cloudflare type package was added.

## Verification

The full repository suite passes **49 tests, 0 failures**.

On 2026-09-06 a real registry-connected host running Node 22.22.2 + npm 10.9.7 completed:

- `npm ci --ignore-scripts` with only the expected three installed packages;
- vulnerability audit with zero reported vulnerabilities;
- `npm audit signatures` with **3 verified registry signatures** and **3 verified attestations**;
- `npm test` with **49 passed, 0 failed**.

This validates Aura's Node 22 compatibility lane beyond the earlier reconstructed/sandbox checks and closes the apparent Zod-install concern. Node 24.20.0 + npm 11.19.x remains the primary/release lane; it should still receive the same clean-install/signature/test pass before a private-pilot release, but lack of that duplicate lane check is not blocking the Phase 3 deployment proof.

## Deployment tooling and live deployment

ADR 0006 records the deployment-tool isolation decision.

`tools/deploy/` is a deliberately separate deployment trust boundary:

- exact-pinned `esbuild-wasm@0.28.2` only;
- its own package manifest and lockfile;
- lifecycle scripts disabled;
- no Wrangler in Aura's application lock;
- a local-only `npm run plan` mode that bundles and validates configuration without making Cloudflare API calls;
- an explicit `npm run deploy` mode that creates/reuses D1, applies migrations, verifies schema, uploads the Worker with D1/rate-limit bindings, enables `workers.dev`, and checks that unauthenticated `/mcp` access receives the expected `401 Bearer` challenge.

The operator-host plan pass on 2026-09-06 completed with:

```text
Worker:        aura-mcp
MCP URL:       https://aura-mcp.auramonster.workers.dev/mcp
D1 database:   aura
Rate limits:   AUTH=1001, AGENT=1002
Migrations:    0001_initial.sql
Bundle bytes:  651803
Cloudflare changes: none
```

The isolated deploy lock installed one package with zero reported vulnerabilities, one verified registry signature, and one verified attestation.

The real Cloudflare deployment then completed successfully:

- created D1 database `aura`;
- applied `0001_initial.sql`;
- verified the expected schema;
- uploaded Worker `aura-mcp` with D1 plus both rate-limit bindings;
- enabled `https://aura-mcp.auramonster.workers.dev`;
- verified `https://aura-mcp.auramonster.workers.dev/mcp` rejects unauthenticated access with `401` plus a Bearer challenge.

The direct deployment path uses Cloudflare's documented HTTP APIs and built-in Node/Web Platform primitives. If it proves brittle or begins growing into a replacement Cloudflare CLI, stop and use the isolated Wrangler fallback instead.

## Live pilot smoke harness

`tools/pilot/live-smoke.mjs` is a dependency-free Phase 3 integration harness. It creates temporary allowed Aura deployment-verification data plus two one-hour read-only credentials, exercises the live MCP handshake and all five read tools through both agents, revokes one credential and proves live `401 Bearer` rejection while the other remains valid, then removes its temporary rows. Credential tokens remain in memory and are never printed or written to disk.

## Required before closing Phase 3

1. **Completed:** install/verify the isolated deploy tool and run its local-only deployment plan on the operator host.
2. **Completed:** review the plan and deploy with the narrowly scoped Cloudflare API token.
3. **Completed:** confirm D1 migration/schema and the unauthenticated MCP `401 Bearer` smoke test on the real Worker.
4. Run `tools/pilot/live-smoke.mjs --run` against the deployed instance and require both agents to complete initialize, `tools/list`, `get_rules`, board/thread reads, `read_thread`, and search.
5. Require the same run to revoke agent A, prove immediate `401 Bearer` rejection, and prove agent B remains valid.
6. Require the harness to remove its temporary pilot rows successfully.

Do not begin Phase 4 writes/UI until those checks pass.

Before a private-pilot release, also run the clean install/signature/test lane under the primary Node 24.20.0 + npm 11.19.x toolchain.
