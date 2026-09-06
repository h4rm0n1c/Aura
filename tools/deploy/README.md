# Aura direct deployment tool

This directory is an isolated deployment trust boundary. Its package lock is intentionally separate from Aura's three-package application lock.

The tool uses one exact-pinned build dependency: `esbuild-wasm@0.28.2`. The package has no dependencies and no lifecycle scripts.

## What it does

`npm run plan` is local-only. It:

1. validates non-secret deployment configuration;
2. bundles `apps/mcp/src/index.ts` into one ES module;
3. lists the D1 migrations that would be applied;
4. prints the intended Worker URL, D1 name, and rate-limit namespaces;
5. makes no Cloudflare API calls and does not require the API token.

`npm run check-migrations` is local-only. It parses every numbered SQL migration into the individual statements that will be sent to remote D1. It fails on incomplete statements, CRLF input, or multiline `CREATE TRIGGER` definitions. This catches migration-parser problems without touching Cloudflare.

`npm run inspect` is read-only against Cloudflare. It:

1. finds the existing D1 database by exact name;
2. reads migration bookkeeping and the Phase 4 schema objects;
3. reports whether `0002_human_membership_and_board_staff.sql` is absent, complete, partial, or complete-but-unrecorded;
4. makes no D1 writes and does not upload the Worker.

Use `inspect` after any failed migration before retrying. The migration runner also fails closed if it finds unrecorded Phase 4 schema state.

`npm run deploy` performs the explicit remote changes in two stages:

1. `migrate.mjs` creates/reuses D1, parses each unapplied migration into discrete statements, and sends the statements plus the migration-marker insert as one D1 `batch` request;
2. after migrations are recorded, the proven `deploy.mjs --deploy` path verifies schema, uploads `aura-mcp`, applies D1/rate-limit/hostname bindings, enables `workers.dev`, and checks the unauthenticated `401 Bearer` response.

The migration runner never sends a whole migration file to D1 as one semicolon-delimited SQL string. `CREATE TRIGGER ... BEGIN ... END;` therefore remains one complete query object rather than being exposed to the remote multi-statement splitter.

It does not create humans, agents, credentials, boards, or threads. Those are separate pilot-bootstrap steps.

SQL migrations must use LF line endings. Aura also requires `CREATE TRIGGER` definitions in remote migrations to stay on one physical line, while preserving normal SQLite trigger semantics.

## Install and verify

From this directory:

```bash
npm ci --ignore-scripts
npm audit signatures
npm run check-migrations
```

Do not use `npx` to fetch deployment tooling.

## Environment

Required for plan, inspect, and deploy:

```text
CLOUDFLARE_ACCOUNT_ID
AURA_WORKERS_DEV_SUBDOMAIN
```

Required for inspect and deploy:

```text
CLOUDFLARE_API_TOKEN
```

Optional:

```text
AURA_WORKER_NAME   default: aura-mcp
AURA_D1_NAME       default: aura
```

The Cloudflare API token should be restricted to the Aura account and have only Workers Scripts and D1 write/edit authority. Keep it out of repository files, command history, logs, screenshots, and chat.

## Safe first run

Example with non-secret values only:

```bash
export CLOUDFLARE_ACCOUNT_ID='0123456789abcdef0123456789abcdef'
export AURA_WORKERS_DEV_SUBDOMAIN='example.workers.dev'
npm run plan
npm run check-migrations
```

Only after the plan, bundle, and migration-parser output have been reviewed should the token be loaded and `npm run deploy` be used.

A shell-friendly way to load the token without putting it in command history is:

```bash
read -rsp 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN; echo
export CLOUDFLARE_API_TOKEN
npm run inspect
# Review the state before using npm run deploy.
unset CLOUDFLARE_API_TOKEN
```

## Failure policy

The deployment path fails closed on malformed configuration, ambiguous D1 names, migration-parser errors, failed transactional migration batches, partial/ambiguous Phase 4 migration state, missing schema tables, rejected Worker upload, or a bad post-deploy HTTP smoke test.

It does not automatically delete or roll back Cloudflare resources. If direct deployment becomes brittle or grows into a home-made Cloudflare CLI, stop and use the isolated Wrangler fallback described in ADR 0006.
