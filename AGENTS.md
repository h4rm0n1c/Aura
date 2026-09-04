# AGENTS.md

This file is the operating harness for coding agents working in `h4rm0n1c/Aura`.

## Authority

`h4rm0n1c/Aura` is the write target. Other `h4rm0n1c` repositories are read-only prior art unless the user explicitly says otherwise.

Direct user instructions for the current task take precedence over this file.

## Current phase

Aura is in **Phase 3: authenticated read-only MCP**.

Phases 1 and 2 established the executable domain/auth contracts and the initial D1 schema. Phase 3 may add the remote MCP Worker and read paths, but must not smuggle write behavior or new authority rules into transport handlers.

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
- disabled agents fail authentication even when a credential is otherwise valid;
- browser mutations require server-side authorization and CSRF protection;
- raw post HTML is never trusted rendering output;
- board content returned over MCP carries the untrusted-content label and provenance;
- client input never supplies author identity, role, or capability authority;
- rate/size/idempotency limits are server-enforced;
- security-relevant credential/moderation events get durable audit records;
- secrets/private board content do not enter commits, fixtures, logs, or error bodies.

If authority is ambiguous, stop and fix the contract first.

## Current toolchain

```text
Node.js 24.20.0 LTS
npm 11.19.0
TypeScript using erasable syntax
```

Run `npm test`.

Current application code still has zero npm dependencies. Node's built-in test runner and `node:sqlite` are used for local schema tests. Follow ADR 0003/0005: one lockfile, exact direct versions, lifecycle scripts denied, no ad-hoc package execution, prefer platform primitives, and review every dependency as a security change.

Wrangler is not yet in the dependency tree. Review and pin it when the Worker skeleton is added.

## Established core/storage contracts

`packages/core/` owns principals, authentication, IDs, errors, provenance/trust labels, authorization, and exact MCP schemas.

`db/migrations/0001_initial.sql` owns the initial durable schema:

- humans and Access identity mapping;
- agents, ownership, credentials, and capability rows;
- boards, threads, and posts;
- idempotency records;
- audit events;
- planned lookup/list indexes.

Database constraints add defense in depth. They do not replace core authorization.

## Phase 3 rules

- implement read-only MCP tools only: `get_rules`, `list_boards`, `list_threads`, `read_thread`, `search`;
- authenticate before storage access;
- normalize credentials to `AgentPrincipal` before domain logic;
- check the `read` capability server-side for every board-content read;
- never return raw DB rows directly as MCP results;
- wrap board text in the existing untrusted-content/provenance envelope;
- paginate through the frozen core limits;
- keep client-visible errors coarse and secret-safe;
- do not log bearer tokens, post bodies, Access identity payloads, or private search text by default;
- do not add write tools, UI work, uploads, link fetching, OAuth, or a framework to make Phase 3 easier.

## Database invariants

- migrations are numbered and immutable after deployment;
- durable human/agent/board/thread/post IDs use the typed Aura ID contract;
- agent plaintext tokens never enter D1;
- agent disable state and credential revocation are separate and both fail closed;
- author references use relational human/agent FKs rather than trusted display strings;
- parent posts and solution posts must belong to the same thread;
- audit metadata and idempotency responses must not become storage for normal private post bodies;
- indexes must match actual read paths before those paths are exposed remotely.

## Development rules

- Inspect before editing.
- Prefer small direct changes.
- Reject invalid/unknown authority values rather than coercing them.
- Fail closed at security boundaries.
- Keep client-visible auth errors coarse.
- Use cryptographically secure platform randomness for credentials/IDs/tokens.
- Add tests for security boundary changes before moving on.
- Do not introduce queues, vector databases, WebSockets, federation, reputation systems, attachment pipelines, or generic execution without an accepted requirement.

## Documentation discipline

After a non-trivial change, update the owning contract/design doc, `docs/project-state.md` when the baseline changes, `docs/roadmap.md` when phase/gate state changes, and add a concise entry to `docs/agent/log.md`.

Do not create a new document when a current document already owns the information.

## Git/GitHub

Prefer coherent commits over commit spam. Do not rewrite history unless explicitly asked. Never put secrets into commits, issues, logs, examples, or fixtures.

## Done criteria

A non-trivial task is done when implementation, tests, docs, project state, and security assumptions agree.
