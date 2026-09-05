# ADR 0005: TypeScript runtime baseline

Status: accepted; updated in Phase 3 for Node 22 compatibility.

## Decision

Aura uses TypeScript for the Cloudflare Workers implementation and keeps runtime TypeScript within Node's erasable-syntax subset.

Supported local toolchains:

```text
Primary/release    Node.js 24.20.0 LTS + npm 11.19.0
Compatibility      Node.js 22.16.0     + npm 10.9.x
```

`.nvmrc` remains pinned to Node 24.20.0. `packageManager` remains npm 11.19.0 so the reproducible/default lane is unambiguous. The `engines` ranges also admit the compatibility lane.

Node 22.16 predates default TypeScript stripping, so `scripts/run-tests.mjs` adds Node's built-in `--experimental-strip-types` flag only on that older lane. No transform runner or test framework is required.

## Mechanical rules

- `.nvmrc` selects the primary/release Node version.
- `package.json` accepts only the supported Node 22/24 and npm 10/11 lanes.
- `.npmrc` keeps `engine-strict`, `ignore-scripts`, and `save-exact` enabled.
- `package-lock.json` is committed and reviewed with dependency changes.
- `npm test` must work unchanged on both supported lanes.
- use erasable TypeScript syntax; do not require `enum`, parameter properties, runtime namespaces, decorators, or a TS transform just for local execution;
- do not add a package to replace Web Platform, Node, or Worker runtime primitives already sufficient for the job.

If a TypeScript compiler is later added for static checking, use the official `typescript` package as an explicit reviewed development dependency. Do not add a transform runner merely to execute tests.

## Why

Node 24 is the clean current release baseline. Supporting Node 22.16 as a compatibility floor costs one tiny dependency-free launcher and matches environments that have not yet moved to Node 24.

Keeping both lanes on Node's own type stripping avoids another JavaScript supply-chain branch solely for test execution.

References:

- https://nodejs.org/download/release/v24.20.0/docs/api/typescript.html
- https://nodejs.org/download/release/v24.20.0/docs/api/cli.html
- https://developers.cloudflare.com/workers/languages/typescript/

## Revisit when

- Node 22 leaves the useful support window for Aura contributors;
- Worker requirements need TypeScript syntax Node cannot strip;
- a build step becomes necessary for a concrete reason;
- Cloudflare changes its recommended Worker toolchain materially.
