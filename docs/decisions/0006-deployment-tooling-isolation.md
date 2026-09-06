# ADR 0006: Deployment tooling isolation

Status: accepted for Phase 3.

## Context

Aura's Worker runtime dependency graph is deliberately small. Deployment tooling has a different trust profile: it receives Cloudflare credentials, can modify D1 and Worker configuration, and may execute install-time code on the developer or CI machine.

The earlier Phase 3 sandbox could not complete a registry install because it could not resolve `registry.npmjs.org`. A later real registry-connected host completed the root install, registry signature/attestation audit, and all tests successfully. There is no evidence of a defect in `zod@4.5.4` or the locked MCP dependency graph.

Wrangler was reviewed separately because adding a deployment CLI to Aura's application dependency graph would substantially enlarge that graph and change its lifecycle-script assumptions.

## Wrangler assessment

Wrangler reviewed on 2026-09-05: `4.129.0`.

Its direct runtime dependencies include:

- `@cloudflare/kv-asset-handler`;
- `@cloudflare/unenv-preset`;
- `blake3-wasm`;
- `esbuild`;
- `miniflare`;
- `path-to-regexp`;
- `unenv`;
- `workerd`.

This is reasonable for a full local-development/deployment CLI, but it is materially larger than Aura's application runtime.

Cloudflare's own Workers SDK repository applies supply-chain controls including a minimum package release age and an explicit lifecycle-build allowlist. `esbuild` and `workerd` are explicitly approved build-script packages there. Current Miniflare uses `sharp@0.35.2`; the older `sharp <0.35.0` advisory path reported through Wrangler has therefore moved past the affected range in the current source tree.

Wrangler also releases very frequently. Aura should not adopt a same-day Wrangler release merely because it is `latest`.

## Decision

### 1. Deployment tooling does not enter Aura's application lockfile

Do not add Wrangler or the deployment bundler to the root `package.json` or root `package-lock.json`.

The application lock remains an audit boundary for code required by Aura itself.

Deployment tooling lives under `tools/deploy/` with its own manifest and lockfile. This is a deliberate exception to ADR 0003's normal one-lockfile rule: the second lock exists specifically to separate high-authority deployment tooling from the application dependency graph.

Do not use unpinned `npx` or `npm exec` commands to fetch deployment tooling dynamically.

### 2. Phase 3 direct deployment path

The accepted Phase 3 deployment proof uses:

- exact-pinned `esbuild-wasm@0.28.2` for bundling;
- Node/Web Platform primitives for multipart upload and HTTP calls;
- Cloudflare's documented Workers Script Upload API;
- Cloudflare's documented D1 create/query APIs;
- Cloudflare's documented Worker subdomain API;
- least-privilege Cloudflare API tokens.

`esbuild-wasm@0.28.2` has no package dependencies and declares no lifecycle scripts. Build speed is less important here than keeping the deployment install small and avoiding native/install-time package fan-out.

The direct tool has two deliberately separate modes:

- `npm run plan` is local-only: validate non-secret configuration, bundle the Worker, list migrations, and print the intended deployment. It makes no Cloudflare API calls and does not require the API token.
- `npm run deploy` is the explicit remote mutation: create/reuse D1, apply and record migrations, verify schema, upload the Worker with D1/rate-limit/hostname bindings, enable `workers.dev`, and verify that unauthenticated `/mcp` access receives the expected `401 Bearer` challenge.

The Workers API supports D1 and rate-limit bindings directly in upload metadata, so Aura's Phase 3 bindings do not make Wrangler mandatory.

This path is accepted only while it remains small. Do not grow a custom general-purpose Cloudflare CLI around it.

### 3. Wrangler remains an isolated fallback

If direct deployment becomes brittle, or `wrangler dev` provides concrete value we cannot cheaply reproduce, use Wrangler in an isolated deployment-tool lane rather than adding it to Aura's application lock.

If Wrangler is introduced:

- pin one exact reviewed version;
- prefer a release that has been public for at least 48 hours;
- audit its full lockfile and vulnerability report before adoption;
- verify registry signatures/provenance;
- explicitly review every dependency lifecycle script;
- use npm's narrow lifecycle-script controls appropriate to the selected npm version;
- disable Wrangler telemetry for Aura;
- keep Cloudflare credentials out of repo files and logs.

The application/test compatibility floor remains Node 22.16/npm 10.9. The primary/release lane remains Node 24.20/npm 11.19.

## Consequences

Aura keeps a small, legible application supply chain and isolates the code that receives deployment authority.

The direct API path introduces a small amount of local deployment code. It must stay narrow, use documented Cloudflare formats, fail closed, and avoid destructive rollback automation. If maintaining it starts to resemble maintaining a platform CLI, stop and use isolated Wrangler instead.

## References checked 2026-09-05 to 2026-09-06

- https://www.npmjs.com/package/wrangler
- https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/package.json
- https://github.com/cloudflare/workers-sdk/blob/main/pnpm-workspace.yaml
- https://www.npmjs.com/package/esbuild-wasm
- https://github.com/evanw/esbuild/tree/v0.28.2/npm/esbuild-wasm
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/
- https://developers.cloudflare.com/api/resources/d1/
- https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## Revisit when

- the direct deployment proof fails or becomes disproportionately complex;
- Aura needs reliable local `workerd`/D1 simulation;
- Cloudflare publishes a materially smaller official deployment client;
- npm lifecycle-script controls change materially.
