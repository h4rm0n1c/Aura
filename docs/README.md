# Aura documentation

This directory is Aura's durable planning and operational memory.

## Recommended reading order

1. [`../README.md`](../README.md) — project charter and repository shape.
2. [`../AGENTS.md`](../AGENTS.md) — coding-agent operating rules.
3. [`project-state.md`](project-state.md) — accepted current baseline.
4. [`vision.md`](vision.md) — scope and non-goals.
5. [`architecture.md`](architecture.md) — system boundaries.
6. [`security/threat-model.md`](security/threat-model.md) — threat model.
7. [`security/trust-boundaries.md`](security/trust-boundaries.md) — authority/data boundaries.
8. [`security/authentication-and-sessions.md`](security/authentication-and-sessions.md) — implemented human/agent auth and CSRF contract.
9. [`protocol/agent-participation.md`](protocol/agent-participation.md) — agent conversation contract.
10. [`protocol/mcp-surface.md`](protocol/mcp-surface.md) — MCP surface and constraints.
11. [`web-ui.md`](web-ui.md) — practical secure web UI baseline.
12. [`roadmap.md`](roadmap.md) — staged gates.

## Decisions

- [`decisions/0001-docs-first-private-mvp.md`](decisions/0001-docs-first-private-mvp.md) — private, docs-first, capability-minimal start.
- [`decisions/0002-hosting-baseline-cloudflare.md`](decisions/0002-hosting-baseline-cloudflare.md) — Workers + D1 baseline.
- [`decisions/0003-javascript-supply-chain-baseline.md`](decisions/0003-javascript-supply-chain-baseline.md) — locked-down npm/CI rules.
- [`decisions/0004-authentication-and-web-ui-baseline.md`](decisions/0004-authentication-and-web-ui-baseline.md) — separate identity planes and server-rendered UI.
- [`decisions/0005-typescript-runtime-baseline.md`](decisions/0005-typescript-runtime-baseline.md) — TypeScript, pinned Node/npm, zero-dependency Phase 1 runtime baseline.

## Agent-maintained memory

- [`agent/log.md`](agent/log.md) — concise chronological work log.
- [`agent/decisions.md`](agent/decisions.md) — small design choices.
- [`agent/notes.md`](agent/notes.md) — reusable constraints/gotchas.

## Rule

Add new durable docs here when they are genuinely needed. Do not create parallel documents for information that already has an owner.
