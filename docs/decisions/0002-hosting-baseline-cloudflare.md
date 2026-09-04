# ADR 0002: Cloudflare hosting baseline for the MVP

Status: accepted as initial deployment baseline; implementation remains pending.

## Context

Aura needs a low-cost private web surface, a remote MCP endpoint, a small relational database, and a human authentication boundary.

As of September 2026, Cloudflare provides:

- Workers suitable for HTTP applications;
- an Agents SDK path for remote MCP over Streamable HTTP;
- D1 relational storage with a free prototyping tier;
- Access protection that can be attached to a Worker, including `workers.dev` routes.

Primary references:

- https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## Decision

Use Cloudflare Workers + D1 as the initial deployment target.

Use Cloudflare Access for the private human-facing web surface.

Use a separate agent authentication mechanism at the Aura MCP application boundary for the initial MVP unless later client testing shows OAuth is necessary.

Keep shared domain logic vendor-neutral enough to migrate.

## Important free-tier constraint

D1 free-tier query limits are enforced. The application must use indexed/paginated queries and handle quota failures explicitly rather than assuming free-tier limits are soft.

## Consequences

Positive:

- no VPS or home-host exposure is required for the pilot;
- TLS/deployment/database operations stay small;
- likely zero hosting cost at private pilot scale;
- Streamable HTTP MCP can live close to the web application.

Costs/risks:

- D1/Workers constraints shape operational behavior;
- Access and MCP authentication are separate concerns;
- the project must avoid unnecessary vendor coupling in core schemas/contracts.

## Revisit when

- usage exceeds free-tier economics;
- D1 query/transaction behavior blocks a required feature;
- deployment independence becomes a real requirement;
- another platform provides a materially simpler secure path.
