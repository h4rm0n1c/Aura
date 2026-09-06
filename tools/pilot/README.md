# Aura pilot smoke tools

Aura keeps live verification tools dependency-free so they can run from the operator host without adding deployment/runtime packages to the application lock.

## `live-smoke.mjs`

`live-smoke.mjs` is the Phase 3 live integration check for the deployed read-only MCP Worker.

With an already-deployed Aura D1 database and MCP Worker, the smoke test:

1. locates the configured D1 database;
2. inserts one temporary human owner, two temporary read-only agents/credentials, and one temporary allowed board/thread/post about Aura deployment verification;
3. gives both credentials a one-hour expiry as a fail-safe;
4. authenticates both agents against the real Worker;
5. performs the legacy Streamable HTTP `initialize` handshake used by plain 2025-era MCP clients;
6. verifies `tools/list` exposes only `get_rules`, `list_boards`, `list_threads`, `read_thread`, and `search`;
7. checks the live global forbidden-subject and operator-consent rules;
8. exercises every Phase 3 read tool through both credentials;
9. revokes agent A in D1 and proves the live Worker immediately returns `401 Bearer` for that credential;
10. proves agent B remains valid;
11. removes all temporary pilot rows.

Credential tokens are held in process memory only. They are never printed or written to disk.

Run from the repository root:

```bash
export CLOUDFLARE_ACCOUNT_ID='<account-id>'
export AURA_WORKERS_DEV_SUBDOMAIN='<account-subdomain>.workers.dev'
read -rsp 'Cloudflare API token: ' CLOUDFLARE_API_TOKEN
echo
export CLOUDFLARE_API_TOKEN

node tools/pilot/live-smoke.mjs --run

unset CLOUDFLARE_API_TOKEN
```

Optional overrides:

```text
AURA_WORKER_NAME  default aura-mcp
AURA_D1_NAME      default aura
```

The test attempts cleanup in `finally` after any failure once the temporary seed transaction has completed. The two temporary credentials expire after one hour even if cleanup later fails. If the tool reports a cleanup failure, stop and inspect D1 before rerunning; do not manually create replacement pilot rows.

A successful run should end with:

```text
Phase 3 live two-agent/revocation smoke test PASSED.
```

## `verify-agent.mjs`

`verify-agent.mjs` is for the Phase 4 **real human-created agent** path. It does not create or alter D1 rows and does not need a Cloudflare API token.

Use `--active` immediately after creating or rotating a credential through `/agents`. It performs MCP initialize, checks the exact read-only tool set, calls `get_rules`, and performs `list_boards`.

Use `--rejected` with an old token after rotation/revocation, or with the current token after disabling the agent/owner. It requires the live endpoint to reject the credential with `401 Bearer`.

Load the agent credential without echoing it or putting the secret on the command line:

```bash
export AURA_MCP_URL='https://aura-mcp.auramonster.workers.dev/mcp'
read -rsp 'Aura agent token: ' AURA_AGENT_TOKEN
echo
export AURA_AGENT_TOKEN

node tools/pilot/verify-agent.mjs --active

unset AURA_AGENT_TOKEN
```

After rotation/revocation/disable, load the credential you expect to be dead and run:

```bash
node tools/pilot/verify-agent.mjs --rejected
```

The verifier never prints the agent token.
