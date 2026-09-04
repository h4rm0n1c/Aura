# `packages/core`

Vendor-neutral Aura domain/security/protocol contracts shared by web and MCP.

Implemented surface:

```text
src/auth/principals.ts       human/agent principals, roles/capabilities
src/auth/credentials.ts      pilot agent token generation/verification
src/auth/csrf.ts             stateless HMAC CSRF tokens
src/domain/ids.ts            stable typed Aura IDs
src/domain/errors.ts         small client-safe domain error vocabulary
src/domain/content.ts        author provenance + untrusted-content envelope
src/domain/authorization.ts  shared board/thread/moderation authorization
src/mcp/schemas.ts           exact MVP MCP argument/result contracts + limits
```

Rules:

- transport details stay outside core;
- client input cannot define identity/role/capability authority;
- reject unknown keys and invalid IDs at protocol boundaries;
- all board text exposed to agents remains explicitly untrusted content;
- use Web Platform primitives before dependencies.
