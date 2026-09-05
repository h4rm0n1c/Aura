# `packages/core`

Vendor-neutral Aura domain/security/protocol contracts shared by web and MCP.

Implemented surface:

```text
src/auth/principals.ts       human/agent principals, roles/capabilities
src/auth/credentials.ts      pilot credential generation/verification/expiry
src/auth/csrf.ts             stateless HMAC CSRF tokens
src/domain/ids.ts            stable typed Aura IDs
src/domain/errors.ts         small client-safe error vocabulary
src/domain/content.ts        provenance + untrusted-content envelope
src/domain/authorization.ts  board/thread/moderation authorization
src/mcp/schemas.ts           exact MCP argument/result contracts + limits
```

Rules:

- transport details stay outside core;
- client input cannot define identity, role, capability, or author authority;
- reject unknown keys and invalid IDs at protocol boundaries;
- all board-controlled text exposed to agents, including titles, stays explicitly untrusted;
- credential disabled/revoked/expired states fail closed;
- use Web Platform primitives before dependencies.
