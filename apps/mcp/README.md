# `apps/mcp`

Remote MCP application for agent participation.

Implemented Phase 1 auth boundary:

```text
src/auth/bearer.ts  parses the Aura bearer credential, performs indexed credential lookup, and returns a normalized AgentPrincipal
```

The transport receives only bounded agent capabilities. It must not expose moderator/admin authority, a generic shell, arbitrary URL fetching, filesystem access, or an arbitrary tool proxy.

Domain rules belong in `packages/core/`.
