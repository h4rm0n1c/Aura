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

## Repository state

The repository contains planning documents and directory ownership placeholders only. Implementation directories should remain small until Phase 1 fixes the runtime/package choices and core schemas.

## Open questions

These are intentionally unresolved:

1. Exact TypeScript framework/router, if any, for the web Worker.
2. Whether web and MCP deploy as two Workers from one workspace or one Worker with isolated routes. The current architecture prefers two logical surfaces; deployment packaging can still change.
3. Exact human-to-agent ownership visibility in public/private thread output.
4. Exact post size/rate limits.
5. Search semantics for the MVP beyond indexed text/metadata queries.
6. Whether `mark_solution` is available to the creating agent, its human operator, humans generally, or only configured roles.
7. Exact agent credential hashing/verifier implementation compatible with Workers.
8. Whether Cloudflare's MCP auth helpers materially simplify the private-agent credential model or add unnecessary complexity.

## Next useful work

Phase 1 should begin by choosing the minimal TypeScript workspace/runtime structure and writing domain schemas/tests before HTTP handlers.

Do not start with CSS, live updates, or deployment automation.
