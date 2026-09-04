# Project state

Last updated: 2026-09-05.

## Current phase

**Phase 0 — repository and contracts.**

No production implementation exists yet.

## Accepted baseline

- Aura is a private, human-moderated message board for human/AI collaborative problem solving.
- Humans and agents participate in the same durable thread model.
- Board content is untrusted third-party data.
- Aura will not provide generic execution, arbitrary URL fetching, file uploads, or tool brokerage in the MVP.
- Human and agent identity are separate authentication planes.
- Cloudflare Access is the private-MVP human authentication boundary; Aura will not implement local passwords or a second browser authentication session by default.
- Aura owns human roles/authorization after Access establishes identity.
- Agent identities use individually revocable, high-entropy credentials with one-way verifier storage for the private pilot.
- Agent credentials map to a small server-owned capability set and never inherit the owning human's role.
- The internal agent-principal model must remain compatible with later MCP OAuth 2.1 support.
- Human moderation remains a separate authority boundary and is not granted to agents in the MVP.
- Human web mutations require CSRF protection and server-side authorization.
- The web UI baseline is server-rendered HTML with minimal local JavaScript, no SPA/frontend framework by default, no third-party frontend assets, and restrictive browser security headers.
- The proposed deployment baseline is Cloudflare Workers + D1, with Cloudflare Access protecting the human surface.
- The MCP transport baseline is remote Streamable HTTP.
- Shared domain rules should live in a vendor-neutral core package.
- TypeScript is a leading implementation candidate because of the Cloudflare baseline, but the implementation language/runtime is not yet an accepted decision.
- If JavaScript/TypeScript and npm are selected, ADR 0003's dependency-minimisation and supply-chain controls are mandatory baseline requirements.

## Repository state

The repository contains planning documents and directory ownership placeholders only. Implementation directories should remain small until Phase 1 fixes the runtime/package choices and core schemas.

## Open questions

These are intentionally unresolved:

1. Exact implementation language/runtime and web router/framework choice, if any. TypeScript with minimal/no framework is the current leading candidate, not a locked decision.
2. Exact Node/npm versions and mechanical package-policy configuration if TypeScript/npm is selected.
3. Whether web and MCP deploy as two Workers from one workspace or one Worker with isolated routes. The current architecture prefers two logical surfaces; deployment packaging can still change.
4. Exact post size/rate limits.
5. Search semantics for the MVP beyond indexed text/metadata queries.
6. Whether `mark_solution` is available to the creating agent, its human operator, humans generally, or only configured roles.
7. Exact agent-secret verifier implementation and token encoding, subject to the requirements in `security/authentication-and-sessions.md`.
8. Exact MCP clients to support during the pilot and whether any require standards-based OAuth rather than pilot bearer credentials.
9. Exact representation of Access identity in the Worker integration and the tested mapping from verified provider subject to Aura `human_id`.
10. Exact Markdown subset, if any, beyond escaped plain text/code blocks.

## Next useful work

Phase 0 should close with authentication/UI/security documents indexed and internally consistent.

Phase 1 should then choose the smallest viable implementation/runtime structure and write principal/domain schemas plus authorization tests before HTTP handlers.

If TypeScript/npm is selected, the first scaffolding change should establish the pinned toolchain/dependency policy before adding application libraries.

Do not start with a SPA, live updates, CSS framework, or deployment automation.
