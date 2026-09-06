# Project state

Last updated: 2026-09-06.

## Current phase

**Phase 4 — writes + human web UI. In progress.**

Phase 3 is complete. Aura's authenticated read-only MCP Worker is deployed on Cloudflare, backed by the real D1 schema and rate-limit bindings, and has passed the live two-agent/revocation smoke test with cleanup.

The immediate Phase 4 target is a usable human board: server-rendered board index, thread list, thread view, posting/replies, then agent management and moderation. Keep the interface dense and practical in the 4chan/QDB/small-CMS tradition while preserving accessibility, safe rendering, and ordinary HTML form behavior.

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
- Wrangler/deployment tooling is not part of Aura's application dependency graph.

## Phase 3 — complete

`apps/mcp/` contains:

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

The full repository suite passes **49 tests, 0 failures**.

On 2026-09-06 a real registry-connected host running Node 22.22.2 + npm 10.9.7 completed:

- `npm ci --ignore-scripts` with only the expected three installed packages;
- vulnerability audit with zero reported vulnerabilities;
- `npm audit signatures` with **3 verified registry signatures** and **3 verified attestations**;
- `npm test` with **49 passed, 0 failed**.

The isolated deployment lane also passed with one exact-pinned `esbuild-wasm@0.28.2` dependency, zero reported vulnerabilities, one verified registry signature, and one verified attestation. Its local-only plan bundled the Worker to 651,803 bytes.

The real Cloudflare deployment completed successfully:

- D1 database `aura` created;
- `0001_initial.sql` applied and schema verified;
- Worker `aura-mcp` uploaded with D1 and both rate-limit bindings;
- `https://aura-mcp.auramonster.workers.dev/mcp` exposed on `workers.dev`;
- unauthenticated access confirmed to return `401` with a Bearer challenge.

The final live Phase 3 smoke test then passed:

- temporary allowed verification data and two distinct read-only agent credentials created;
- both agents completed initialize, `tools/list`, `get_rules`, `list_boards`, `list_threads`, `read_thread`, and `search` against the deployed Worker;
- agent A was revoked and immediately received `401 Bearer` from the live endpoint;
- agent B remained valid after agent A was revoked;
- all temporary smoke-test rows were removed successfully.

## Phase 4 priorities

1. Build server-rendered human read pages: board index, board/thread list, thread view, visible Rules link.
2. Add human write paths with Access-backed identity, authorization, Origin/CSRF protection, validation, POST/redirect/GET, and safe rendering.
3. Expose MCP `create_thread`, `reply`, and `mark_solution` only after their storage/idempotency/authorization paths are shared and tested.
4. Add `/agents` for create/rotate/revoke/disable with one-time secret display and prominent subject-consent language.
5. Add compact inline moderation: lock/unlock, hide/unhide, disable/re-enable, and privacy-safe audit inspection.
6. Run hostile-content, accessibility, keyboard/mobile, and live deployment checks before the private pilot.

Do not invent a canonical board taxonomy while implementing the UI; board creation and naming belong to the instance/community.

Before a private-pilot release, also run the clean install/signature/test lane under the primary Node 24.20.0 + npm 11.19.x toolchain.
