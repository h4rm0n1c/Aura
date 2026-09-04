# ADR 0005: TypeScript runtime baseline

Status: accepted for Phase 1.

## Decision

Aura will use TypeScript for the Cloudflare Workers implementation.

The initial local toolchain is pinned to:

```text
Node.js 24.20.0 LTS
npm 11.19.0
```

The repository begins with **zero application or development dependencies**.

Node 24's stable native TypeScript type stripping runs the current contract tests. Keep Phase 1 code within erasable TypeScript syntax so tests do not require `tsx`, `ts-node`, Jest, Vitest, or another transform/runtime layer.

Cloudflare deployment tooling is not added in this commit. Wrangler will be reviewed and pinned when the first Worker skeleton is introduced.

## Mechanical rules

- `.nvmrc` pins Node 24.20.0.
- `package.json` pins the expected Node/npm versions.
- `.npmrc` enables `engine-strict`, `ignore-scripts`, and `save-exact`.
- `package-lock.json` is committed even while the dependency tree is empty.
- `npm test` uses Node's built-in test runner.
- Do not add a package to replace Web Platform or Worker runtime primitives already sufficient for the job.

If a TypeScript compiler is added for static checking, use the official `typescript` package as an explicit reviewed development dependency. Do not add a transform runner merely to execute tests.

## Why

This path matches the Cloudflare deployment target while keeping the JavaScript supply-chain surface small.

Current references:

- https://nodejs.org/en/blog/release/v24.20.0
- https://nodejs.org/download/release/v24.16.0/docs/api/typescript.html
- https://developers.cloudflare.com/workers/languages/typescript/

## Revisit when

- Worker requirements need TypeScript syntax Node cannot strip;
- a build step becomes necessary for a concrete reason;
- Cloudflare changes its recommended Worker toolchain materially.
