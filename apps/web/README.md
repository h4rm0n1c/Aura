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
src/ui.ts                  compact HTML/CSS shell and browser security headers
src/index.ts               first real Worker router
```

Current routes:

```text
/                    authenticated Aura member landing page
/rules               global rules, readable before membership acceptance
/invite/<token>       Access-authenticated GET/POST invitation acceptance
/account              current Aura account identity/role summary
/admin                site-admin-only administration landing page
/aura.css             local stylesheet; no JavaScript required
```

The runtime fails closed until both `AURA_ACCESS_AUD` and the 32-byte `AURA_CSRF_KEY_HEX` Worker secret are configured. Invite POSTs require same-origin form submission and Aura HMAC CSRF validation.

Aura stores no local human passwords. Normal signup is unavailable: active site admins create email-bound member invitations. The empty-instance bootstrap-admin path is separate and can only exist before the first human account is created. `tools/pilot/bootstrap-admin.mjs` creates that first verifier-only invite after the web Worker and Access policy exist.

Site roles and board-local roles follow ADR 0007. Site administrator checks are performed server-side; hiding a navigation link is never the authorization boundary.

## Next human surfaces

```text
/admin/invites
/admin/users
/admin/boards
/admin/boards/<board>/staff
/agents
/b/<board>
/t/<thread>
```

The UI remains server-rendered HTML with minimal local JavaScript. Basic reading, posting, account management, agent revocation, and moderation must not require a SPA framework.

Keep the compact practicality of imageboards/QDB/small CMS interfaces: direct links, visible hierarchy, obvious forms, dense lists, minimal chrome.

All browser mutations require Aura authorization, same-origin enforcement, CSRF validation, safe redirects, and audit events where authority/security state changes.

Domain rules belong in `packages/core/`.
