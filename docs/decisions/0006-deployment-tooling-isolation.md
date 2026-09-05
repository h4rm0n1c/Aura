# ADR 0006: Deployment tooling isolation

Status: accepted for Phase 3.

## Context

Aura's Worker runtime dependency graph is deliberately small. Deployment tooling has a different trust profile: it receives Cloudflare credentials, can modify D1 and Worker configuration, and may execute install-time code on the developer or CI machine.

The Phase 3 sandbox could not complete `npm ci` because it cannot resolve `registry.npmjs.org`. The committed lockfile itself is not showing a Zod defect: `zod@4.5.4`, `@modelcontextprotocol/server@2.0.0`, and `@modelcontextprotocol/core@2.0.0` are exact and carry registry integrity hashes. Do not change versions to work around a sandbox DNS/cache limitation.

Wrangler was then reviewed separately.

## Wrangler assessment

Current Wrangler reviewed on 2026-09-05: `4.129.0`.

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

### 1. Wrangler does not enter Aura's application lockfile

Do not add Wrangler to the root `package.json` or root `package-lock.json`.

The application lock remains an audit boundary for code required by Aura itself.

Do not use unpinned `npx wrangler` or `npm exec wrangler` commands.

### 2. Preferred Phase 3 deployment proof: small direct deploy path

Before adding Wrangler, prototype deployment using:

- an exact-pinned, reviewed bundler with no dependency lifecycle scripts; `esbuild-wasm@0.28.1` is the current candidate;
- Node/Web Platform primitives for multipart upload;
- Cloudflare's documented Workers Script Upload API;
- Cloudflare's documented D1 API for database creation/query/import;
- least-privilege Cloudflare API tokens.

The Workers API supports D1 and rate-limit bindings directly in upload metadata, so Aura's Phase 3 bindings do not make Wrangler mandatory.

This path is accepted only if a local bundle smoke test and a real staging deployment prove it practical. Do not grow a custom deployment framework around it.

### 3. Wrangler remains an isolated fallback

If direct deployment becomes brittle, or `wrangler dev` provides concrete value we cannot cheaply reproduce, use Wrangler in a separate deployment-tool directory with its own package manifest and lockfile.

That exception to ADR 0003's single-lockfile rule exists specifically to keep high-authority deployment tooling out of the application dependency graph.

If Wrangler is introduced:

- pin one exact reviewed version;
- prefer a release that has been public for at least 48 hours;
- audit its full lockfile and vulnerability report before adoption;
- verify registry signatures/provenance;
- explicitly review every dependency lifecycle script;
- use npm 11's `allowScripts`/`strict-allow-scripts` controls or an equivalently narrow mechanism;
- disable Wrangler telemetry for Aura;
- keep Cloudflare credentials out of repo files and logs.

The deployment-tool lane may require Node 24/npm 11 even though Aura's application/test compatibility floor remains Node 22.16/npm 10.9.

## Consequences

Aura keeps a small, legible application supply chain while retaining an official Wrangler escape hatch.

The direct API path creates some local deployment code, so it must stay small and follow Cloudflare's documented upload formats. If maintaining it starts to approximate maintaining a CLI, stop and use isolated Wrangler instead.

## References checked 2026-09-05

- https://www.npmjs.com/package/wrangler
- https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/package.json
- https://github.com/cloudflare/workers-sdk/blob/main/pnpm-workspace.yaml
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/
- https://developers.cloudflare.com/api/resources/d1/
- https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/
- https://developers.cloudflare.com/api/typescript/resources/workers/
- https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts/

## Revisit when

- the direct deployment proof fails or becomes disproportionately complex;
- Aura needs reliable local `workerd`/D1 simulation;
- Cloudflare publishes a materially smaller official deployment client;
- npm lifecycle-script controls change materially.
