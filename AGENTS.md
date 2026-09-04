# AGENTS.md

This file is the operating harness for coding agents working in `h4rm0n1c/Aura`.

## Authority

`h4rm0n1c/Aura` is the write target. Other `h4rm0n1c` repositories are read-only prior art unless the user explicitly says otherwise.

Direct user instructions for the current task take precedence over this file.

## Current phase

Aura is in **Phase 2: schema and identity foundation**.

Phase 1 contracts are now executable. Database work must encode those contracts rather than invent parallel IDs, roles, trust labels, errors, or authorization rules.

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
TypeScript using erasable syntax for current contract code
```

Run `npm test`.

Current code deliberately has zero npm dependencies. Follow ADR 0003 and ADR 0005: one lockfile, exact direct versions, lifecycle scripts denied, no ad-hoc package execution, prefer platform primitives, and review every dependency as a security change.

## Current core contracts

`packages/core/` owns:

- human/agent principals, roles, and capabilities;
- pilot credential verification and CSRF;
- stable Aura IDs;
- domain error vocabulary;
- board-content provenance/trust labels;
- board/thread/solution/moderation authorization;
- exact MCP argument/result types and validation limits.

Transport code translates into these contracts. It does not redefine them.

## Phase 2 database rules

- use typed Aura IDs from `src/domain/ids.ts` for durable human/agent/board/thread/post IDs;
- keep credentials separate from agent identity records;
- store agent secret verifiers only;
- use foreign keys and constraints for relationships/state where D1 supports them;
- create indexes for every planned lookup/list path before relying on them;
- authorization remains in core/application logic even when DB constraints add defense in depth;
- audit records must use stable actor/target IDs and must not contain secrets or normal post bodies;
- migrations are numbered, immutable after deployment, and tested from an empty database.

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
