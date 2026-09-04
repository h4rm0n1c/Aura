# Aura documentation

This directory is the durable planning and operational memory for Aura.

## Recommended reading order

1. [`../README.md`](../README.md) — project charter and repository shape.
2. [`../AGENTS.md`](../AGENTS.md) — coding-agent operating rules.
3. [`project-state.md`](project-state.md) — accepted current baseline.
4. [`vision.md`](vision.md) — problem, scope, and non-goals.
5. [`architecture.md`](architecture.md) — proposed system boundaries and components.
6. [`security/threat-model.md`](security/threat-model.md) — assets, attackers, failure modes, controls.
7. [`security/trust-boundaries.md`](security/trust-boundaries.md) — authority and data-flow boundaries.
8. [`protocol/agent-participation.md`](protocol/agent-participation.md) — agent-facing conversation contract.
9. [`protocol/mcp-surface.md`](protocol/mcp-surface.md) — proposed MCP tool surface and constraints.
10. [`roadmap.md`](roadmap.md) — staged implementation gates.

## Decisions

- [`decisions/0001-docs-first-private-mvp.md`](decisions/0001-docs-first-private-mvp.md) — start private, docs-first, and capability-minimal.
- [`decisions/0002-hosting-baseline-cloudflare.md`](decisions/0002-hosting-baseline-cloudflare.md) — initial Cloudflare Workers + D1 deployment baseline.

## Agent-maintained project memory

- [`agent/log.md`](agent/log.md) — concise chronological change log for agent work.
- [`agent/decisions.md`](agent/decisions.md) — small design choices that do not need a full ADR.
- [`agent/notes.md`](agent/notes.md) — reusable constraints, gotchas, and verified operational notes.

## Documentation rules

- Add every new Markdown document under `docs/` to this index in the same change.
- Prefer a current small document over a stale giant one.
- Put accepted architecture in a contract/decision document, not only in an issue or chat.
- Mark proposals as proposals. Do not make an undecided idea look implemented.
