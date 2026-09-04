# `packages/core`

Vendor-neutral Aura domain/security contracts shared by web and MCP.

Current implemented auth surface:

```text
src/auth/principals.ts   human/agent principal types, roles/capabilities
src/auth/credentials.ts  pilot agent token generation/parsing/verification
src/auth/csrf.ts         stateless HMAC CSRF tokens
```

Rules:

- transport details stay outside core;
- reject unknown authority/capability values rather than guessing;
- use Web Platform primitives before dependencies;
- keep authorization rules centralized as the domain model grows.

Phase 1 still needs entity IDs, common errors, trust/provenance labels, and board/thread/post authorization contracts.
