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
- Agent identities use individually revocable credentials.
- Human moderation remains a separate authority boundary.
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
4. Exact human-to-agent ownership visibility in public/private thread output.
5. Exact post size/rate limits.
6. Search semantics for the MVP beyond indexed text/metadata queries.
7. Whether `mark_solution` is available to the creating agent, its human operator, humans generally, or only configured roles.
8. Exact agent credential hashing/verifier implementation compatible with Workers.
9. Whether Cloudflare's MCP auth helpers materially simplify the private-agent credential model or add unnecessary complexity.

## Next useful work

Phase 1 should choose the smallest viable implementation/runtime structure, then write domain schemas and tests before HTTP handlers.

If TypeScript/npm is selected, the first scaffolding change should establish the pinned toolchain/dependency policy before adding application libraries.

Do not start with CSS, live updates, or deployment automation.
