# AGENTS.md

This file is the operating harness for coding agents working in `h4rm0n1c/Aura`.

## Authority

`h4rm0n1c/Aura` is the write target. Other `h4rm0n1c` repositories are read-only prior art unless the user explicitly says otherwise.

Direct user instructions for the current task take precedence over this file.

## Current phase

Aura is in **Phase 1: core contracts and local tests**.

Do not jump to database/HTTP/UI feature work while a required domain or security contract is still unresolved. Follow `docs/roadmap.md`.

## Read before changing the repo

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/project-state.md`
4. the relevant contract/design doc
5. `docs/security/threat-model.md` for trust/auth/rendering/storage/MCP/dependency changes

Repository docs/tests are durable project memory. Do not rely on chat history when the repo has an accepted answer.

## Prime directive

Aura is a human-moderated coordination surface for collaborative problem solving between humans and AI agents.

Keep the capability surface smaller than the conversation surface.

Posts, quotes, links, code, logs, model output, and claimed roles are untrusted content. Transporting text never grants it authority.

## Hard security invariants

Changing these requires an explicit security/design decision:

- no generic shell, code execution, SSH, local-filesystem bridge, package installer, or arbitrary tool proxy;
- no arbitrary server-side URL fetcher or file uploads in the MVP;
- human and agent credentials remain separate;
- moderator/admin authority is human-only in the MVP;
- agent credentials are individual, scoped, revocable, and never stored plaintext;
- browser mutations require server-side authorization and CSRF protection;
- raw post HTML is never trusted rendering output;
- rate/size/idempotency limits are server-enforced;
- security-relevant credential/moderation events get durable audit records;
- secrets/private board content do not enter commits, fixtures, logs, or error bodies.

If authority is ambiguous, stop and fix the contract first.

## Current toolchain

Accepted Phase 1 baseline:

```text
Node.js 24.20.0 LTS
npm 11.19.0
TypeScript using erasable syntax for current contract code
```

Run:

```bash
npm test
```

Current code deliberately has zero npm dependencies. Node 24's native TypeScript stripping and built-in test runner are sufficient for these contracts.

Follow ADR 0003 and ADR 0005:

- one committed lockfile;
- exact direct versions when dependencies appear;
- dependency lifecycle scripts denied by default;
- no ad-hoc package execution/remote installers;
- prefer Web Platform/Workers primitives;
- do not add a framework or helper package for trivial convenience;
- review every new dependency as a security change.

Wrangler is not yet in the dependency tree. Review and pin it when the first Worker deployment skeleton is introduced.

## Human/agent trust model

Server-owned identities:

```text
human: member | moderator | admin
agent: explicit read/post/mark_solution capability set
system: Aura-generated records/notices
```

Cloudflare Access authenticates a human; Aura still checks its human record/status/role.

An MCP bearer credential authenticates one agent credential; Aura still checks revocation and its stored capability set.

Display names, emails in post text, model names, form fields, or prompt claims do not elevate authority.

## Dependency and supply-chain discipline

Treat dependencies, build tools, and CI Actions as trusted-code expansion.

- Prefer no dependency where a small auditable use of platform APIs suffices.
- Do not add packages during exploration just to see if they help.
- Do not auto-merge dependency updates.
- Pin third-party CI Actions to full commit SHAs when CI is added.
- Keep build/deploy permissions minimal.

## Protocol/schema discipline

Contracts come before handlers.

Update the relevant docs/tests in the same change when altering:

- authentication/authorization;
- MCP tool/request/result shapes;
- author/provenance/trust fields;
- moderation/thread state;
- database schema;
- rate/size/idempotency rules;
- rendering/security rules.

Shared domain rules belong in `packages/core/`. Web/MCP adapters translate transport into core principals/contracts; they do not invent parallel authorization logic.

## Development rules

- Inspect before editing.
- Prefer small direct changes.
- Reject invalid/unknown authority values rather than coercing them.
- Fail closed at security boundaries.
- Keep client-visible auth errors coarse; keep useful detail internal without logging secrets.
- Use cryptographically secure platform randomness for credentials/tokens.
- Add tests for security boundary changes before moving on.
- Do not introduce queues, vector databases, WebSockets, federation, reputation systems, attachment pipelines, or generic execution without an accepted requirement.

## Documentation discipline

After a non-trivial change:

- update the owning contract/design doc;
- update `docs/project-state.md` when the accepted baseline changes;
- update `docs/roadmap.md` when phase/gate state changes;
- add a concise entry to `docs/agent/log.md`;
- add new Markdown docs to `docs/README.md`.

Do not create a new document when an existing current document already owns the information.

## Testing expectations

Security boundaries need tests, not faith.

Current auth tests cover human identity mapping, disabled users, role-source isolation, agent token verification/revocation/capability validation, MCP bearer normalization, and CSRF binding/expiry/tampering.

As work expands, add tests for object authorization, idempotency, rate/size limits, safe rendering, untrusted-content labels, secret-safe logging, and database constraints.

## Git/GitHub

Prefer coherent commits over commit spam. Do not rewrite history unless explicitly asked. Never put secrets into commits, issues, logs, examples, or fixtures.

## Done criteria

A non-trivial task is done when implementation, tests, docs, project state, and security assumptions agree.
