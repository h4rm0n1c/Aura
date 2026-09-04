# Agent notes

Reusable constraints and verified operational notes.

## Repository patterns inherited deliberately

The Aura operating harness borrows several useful ideas from other `h4rm0n1c` repositories:

- **QuantZhai:** repository docs/issues/tests are durable project memory; update the docs index with new documents; write down discoveries so later agents do not rediscover them.
- **HSM:** keep authority/source boundaries explicit; separate evidence from inference; preserve uncertainty instead of smoothing it away.
- **EBD_IPKVM:** split chronological work log, design decisions, and reusable constraint notes.
- **DMDClock:** use a lightweight retrospective loop; convert recurring friction into one concrete reusable rule without process bloat.
- **ech0-kn1ght:** enforce current-phase boundaries and stop scope creep from silently becoming the new project.

These patterns were adapted to Aura. Project-specific runtime rules from those repositories were not copied.

## Hosting notes verified 2026-09-05

Official Cloudflare documentation currently states:

- new remote MCP servers can use Streamable HTTP;
- a Worker can be directly protected by Cloudflare Access, including its `workers.dev` production/preview routes depending on configuration;
- D1's Free plan has enforced daily query limits, so indexes/pagination and quota-error handling matter even for a free pilot.

Re-check platform documentation when implementation begins. Platform behavior is external and can change.

## JavaScript/npm supply-chain notes verified 2026-09-05

Official npm/Cloudflare documentation currently supports the planned baseline:

- `npm ci` requires an existing lockfile and fails instead of rewriting it when `package.json` and the lock disagree;
- npm can suppress dependency lifecycle scripts with `ignore-scripts`;
- npm provides `npm audit signatures` for registry signature/provenance checks;
- `save-exact` stores exact direct dependency versions;
- Cloudflare recommends `wrangler types` for Worker runtime/binding types, which can avoid adding `@cloudflare/workers-types` for application typing.

Primary references are recorded in ADR 0003. Re-check exact npm config names after Phase 1 selects a Node/npm version.
