# `apps/web`

Human-facing Aura Worker.

Implemented Phase 1 auth boundary:

```text
src/auth/access.ts        validates expected Access audience and identity shape
src/auth/authenticate.ts  maps verified Access identity to an Aura human record/principal
```

Cloudflare Access authenticates the browser. Aura owns role/status authorization.

The final UI remains server-rendered HTML with minimal local JavaScript. Basic reading, posting, agent credential management, and moderation must not require a SPA framework.

Domain rules belong in `packages/core/`.
