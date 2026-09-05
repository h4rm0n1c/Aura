# Project state

Last updated: 2026-09-05.

## Current phase

**Phase 3 — authenticated read-only MCP. In progress.**

The local Phase 3 implementation is complete and tested. Deployment validation is still required before Phase 3 closes.

## Accepted baseline

- Cloudflare Access authenticates humans; Aura owns human roles/status;
- agents use individually revocable and expirable pilot credentials with explicit capabilities;
- an agent credential grants technical capability, not standing consent: the human operator must explicitly authorize Aura use for each subject before the agent reads/searches/posts/replies about it;
- subject authorization does not permit unrelated browsing, unrelated private context, or ongoing autonomous Aura participation;
- boards are instance/community configuration; Aura has no canonical built-in topic taxonomy;
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

No `agents`, Hono, Express, Cloudflare types package, frontend framework, or test framework was added.

## Verification

The reconstructed full local suite passes **49 tests, 0 failures**.

The full local suite is verified on Node 22.16.0 + npm 10.9.2. Node 22.16 requires the built-in experimental type-stripping flag; the dependency-free test launcher supplies it automatically. Node 24.20.0 + npm 11.19.0 remains the primary/release toolchain.

The committed application lock resolves only the three expected runtime packages with exact registry URLs and SHA-512 integrity values. The failed clean install in this sandbox is now classified as an environment limitation: the sandbox cannot resolve `registry.npmjs.org`. There is no evidence that `zod@4.5.4` itself is malformed or incompatible.

Actual registry installation and `npm audit signatures` remain required on a host with registry connectivity.

## Deployment tooling decision

ADR 0006 records the Wrangler assessment.

- current Wrangler reviewed: `4.129.0`;
- do not add Wrangler to the root application lockfile;
- do not use unpinned `npx wrangler`;
- preferred next proof is a small direct Cloudflare API deploy path using a reviewed no-install-script bundler candidate (`esbuild-wasm@0.28.1`);
- Wrangler remains an isolated, exact-pinned fallback if direct deployment becomes brittle or local `workerd` simulation proves necessary;
- any Wrangler adoption must review lifecycle scripts and use a dedicated tooling trust boundary.

## Required before closing Phase 3

1. Run a real `npm ci --ignore-scripts`, `npm audit signatures`, and `npm test` under Node 24.20.0 + npm 11.19.x on a registry-connected host.
2. Keep Node 22.16.0 + npm 10.9.x green as the compatibility floor.
3. Prove the minimal bundle/deploy path; fall back to isolated Wrangler only if needed.
4. Create/bind D1 and apply `db/migrations/0001_initial.sql`.
5. Deploy the MCP Worker with D1 and both rate-limit bindings.
6. Authenticate two distinct agent credentials and exercise initialize, tools/list, and read calls.
7. Revoke one credential and prove live rejection.

Do not begin Phase 4 writes/UI until those checks pass.
