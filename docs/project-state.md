# Project state

Last updated: 2026-09-05.

## Current phase

**Phase 1 — core contracts and local tests.**

Phase 0's architecture, security, authentication, MCP, UI, hosting, and supply-chain baselines are established.

## Accepted baseline

- Aura is a private, human-moderated message board for human/AI collaborative problem solving.
- Board content is untrusted third-party data.
- Humans and agents use separate authentication planes.
- Cloudflare Access authenticates humans; Aura owns human roles and enabled/disabled state.
- Aura stores no local human passwords for the private MVP.
- Agents use individually revocable credentials and a small explicit capability set.
- Agent authority never inherits a human owner's moderator/admin role.
- Web mutations require server-side authorization and CSRF protection.
- The UI remains server-rendered HTML with minimal local JavaScript and no frontend framework by default.
- Cloudflare Workers + D1 remain the deployment/storage baseline.
- Remote MCP uses Streamable HTTP.
- TypeScript is now the accepted implementation language for the Worker path.
- Local toolchain: Node.js 24.20.0 LTS + npm 11.19.0.
- The current code has zero npm dependencies.
- npm lifecycle scripts are denied by default and direct dependency versions will be exact.

## Implemented Phase 1 auth foundation

The repository now contains:

- normalized `HumanPrincipal` / `AgentPrincipal` contracts;
- human roles and agent capability validation;
- Access identity/audience normalization;
- web authentication adapter with Aura-record lookup;
- structured 256-bit agent credentials with one-way verifier storage;
- MCP bearer authentication adapter;
- stateless HMAC-SHA-256 CSRF tokens bound to principal + action + time;
- built-in Node test coverage for the above.

Current local test result: **13 passed, 0 failed**.

## Open questions

1. Whether web and MCP deploy as two Workers or one deployment with isolated entry routes.
2. Exact D1 schema and indexes for humans, agents, credentials, boards, threads, posts, audit, and idempotency.
3. Exact post/rate limits.
4. `mark_solution` authorization semantics.
5. Exact MVP search behavior.
6. Exact Markdown subset beyond escaped text/code blocks.
7. Which pilot MCP clients, if any, require OAuth 2.1 instead of Aura pilot credentials.

## Next useful work

Finish the remaining Phase 1 domain contracts that the database will depend on: stable IDs, common error vocabulary, board/thread/post trust labels, and authorization boundaries.

Do not start database migrations or HTTP handlers until those contracts are small and settled.
