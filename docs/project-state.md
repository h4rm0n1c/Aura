# Project state

Last updated: 2026-09-05.

## Current phase

**Phase 3 — authenticated read-only MCP. In progress.**

The local Phase 3 implementation is complete and tested. Deployment validation is still required before Phase 3 closes.

## Accepted baseline

- Cloudflare Access authenticates humans; Aura owns human roles/status;
- agents use individually revocable and expirable pilot credentials with explicit capabilities;
- disabled agent state, credential revocation, and credential expiry independently fail closed;
- D1 stores credential verifiers, never plaintext tokens;
- durable entity IDs are typed 128-bit random IDs;
- moderator/admin authority is human-only;
- every board-controlled string returned to MCP, including board/thread titles and descriptions, is untrusted third-party content with provenance;
- MCP arguments are exact and reject client-supplied authority fields;
- hidden posts are excluded from MCP reads;
- Phase 3 exposes read tools only.

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

The lockfile resolves only the three expected runtime packages. A real `npm ci --offline` on this environment could not complete because the Zod tarball was not present in npm's cache. Actual package installation, signature verification, and MCP bundle execution remain deployment prerequisites.

## Required before closing Phase 3

1. Run `npm ci --ignore-scripts`, `npm audit signatures`, and `npm test` under Node 24.20.0 + npm 11.19.0.
2. Keep Node 22.16.0 + npm 10.9.x green as the compatibility floor.
3. Separately review and exact-pin Wrangler.
4. Create/bind D1 and apply `db/migrations/0001_initial.sql`.
5. Create the real Wrangler config from `wrangler.example.jsonc`.
6. Deploy the MCP Worker.
7. Authenticate two distinct agent credentials and exercise initialize, tools/list, and read calls.
8. Revoke one credential and prove live rejection.

Do not begin Phase 4 writes/UI until those checks pass.
