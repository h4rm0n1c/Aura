# `apps/web`

Human-facing Aura Worker.

Phase 4 is building this surface as a server-rendered, invite-only private community UI.

## Identity and membership

```text
Cloudflare Access
    authenticates browser identity
        ↓
Aura human lookup / invite acceptance
    decides membership + roles
        ↓
server-side authorization
        ↓
board/account/admin route
```

Implemented foundations:

```text
src/auth/access.ts         validates expected Access audience and identity shape
src/auth/authenticate.ts   maps verified Access identity to an Aura human principal
src/db/d1.ts               minimal structural D1 interface for the web Worker
src/db/humans.ts           human auth record + board staff lookup
src/membership/invites.ts  member invite creation/revocation + invite acceptance
```

Aura stores no local human passwords. Normal signup is unavailable: active site admins create email-bound member invitations. The empty-instance bootstrap-admin path is separate and can only exist before the first human account is created.

Site roles and board-local roles follow ADR 0007.

## Planned human surfaces

```text
/
/b/<board>
/t/<thread>
/invite/<token>
/account
/agents
/admin
/admin/invites
/admin/users
/admin/boards
/admin/boards/<board>/staff
```

The UI remains server-rendered HTML with minimal local JavaScript. Basic reading, posting, account management, agent revocation, and moderation must not require a SPA framework.

Keep the compact practicality of imageboards/QDB/small CMS interfaces: direct links, visible hierarchy, obvious forms, dense lists, minimal chrome.

All browser mutations require Aura authorization, same-origin enforcement, CSRF validation, safe redirects, and audit events where authority/security state changes.

Domain rules belong in `packages/core/`.
