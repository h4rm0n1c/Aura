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

`npm run inspect` is read-only against Cloudflare. It:

1. finds the existing D1 database by exact name;
2. reads migration bookkeeping and the Phase 4 schema objects;
3. reports whether `0002_human_membership_and_board_staff.sql` is absent, complete, partial, or complete-but-unrecorded;
4. makes no D1 writes and does not upload the Worker.

Use `inspect` after any failed migration before retrying. The deploy command also performs the same Phase 4 preflight and refuses to apply `0002` over partial or ambiguous state.

`npm run deploy` performs the explicit remote changes. It:

1. creates or reuses the D1 database named `aura`;
2. applies unapplied numbered SQL files from `db/migrations/` and records them in `aura_schema_migrations`;
3. verifies the expected current schema exists, including the Phase 4 membership/board-administration objects;
4. uploads the bundled `aura-mcp` Worker through Cloudflare's Workers Script Upload API;
5. binds D1, both rate limiters, and `AURA_MCP_HOSTNAME` in upload metadata;
6. enables the Worker on the account's `workers.dev` subdomain with preview URLs disabled;
7. confirms `/mcp` returns the expected unauthenticated `401 Bearer` challenge.

It does not create humans, agents, credentials, boards, or threads. Those are separate pilot-bootstrap steps.

SQL migrations must use LF line endings. Remote D1 has historically produced `incomplete input` errors for multiline `CREATE TRIGGER` statements, so trigger definitions in migrations are kept on one physical line while preserving the same SQLite semantics.

## Install and verify

From this directory:

```bash
npm ci --ignore-scripts
npm audit signatures
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
```

Only after the plan and bundle output have been reviewed should the token be loaded and `npm run deploy` be used.

A shell-friendly way to load the token without putting it in command history is:

```bash
read -rsp 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN; echo
export CLOUDFLARE_API_TOKEN
npm run inspect
# Review the state before using npm run deploy.
unset CLOUDFLARE_API_TOKEN
```

## Failure policy

The deploy tool fails closed on malformed configuration, ambiguous D1 names, failed migrations, partial/ambiguous Phase 4 migration state, missing schema tables, rejected Worker upload, or a bad post-deploy HTTP smoke test.

It does not automatically delete or roll back Cloudflare resources. If direct deployment becomes brittle or grows into a home-made Cloudflare CLI, stop and use the isolated Wrangler fallback described in ADR 0006.
