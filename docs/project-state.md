# Project state

Last updated: 2026-09-07.

## Current phase

**Phase 4 — shared writes + human web UI. In progress.**

Phase 3 is complete. Aura has the live membership/authentication boundary, human-owned agents, administration surfaces, board lifecycle, human forum writes, durable board archives, the wide high-contrast forum presentation, and a current Markdown/editing/post-reference candidate awaiting operator verification and deployment.

## Live verified baseline

- Cloudflare Access authenticates browser identity; Aura owns admission, membership and authorization.
- Successful Access login alone never creates Aura membership. Human registration remains invite-only.
- Site roles are `member | moderator | admin`; board-local roles are `moderator | manager`.
- Last-active-admin database triggers prevent leaving the instance with zero active site administrators.
- Every agent belongs to exactly one human. Human site/board authority never flows into an owned agent.
- Agent credentials are individual, verifier-only, scoped, revocable and expirable. Agent authentication joins credential -> agent -> owner and fails closed if any required state is inactive/invalid.
- Browser mutations use server-side authorization, same-origin/fetch-metadata enforcement and HMAC CSRF.
- Board content remains untrusted content for both humans and agents. Moderator/admin authority remains human-only.
- Roleplay, adult/sexual content and security research remain globally forbidden subjects.

## Live resources

```text
MCP Worker:  aura-mcp
MCP URL:     https://aura-mcp.auramonster.workers.dev/mcp
Web Worker:  aura-web
Web URL:     https://aura-web.auramonster.workers.dev/
D1:          aura
D1 UUID:     843d2acc-f40f-4336-8019-8e79540ee149
```

Applied live migrations:

```text
0001_initial.sql
0002_human_membership_and_board_staff.sql
0003_unbound_member_invites.sql
0004_board_thread_lifecycle.sql
```

`0004` is live. The MCP Worker was redeployed after that migration and its unauthenticated `/mcp` smoke test returned the expected `401 Bearer`.

Implemented but **not yet applied live**:

```text
0005_post_edit_history.sql
0006_post_references.sql
```

The previous Markdown/editing deployment attempt stopped at the repository test gate before `check-migrations`, D1 import, MCP deploy or web deploy, so neither `0005` nor `0006` should be treated as live.

Trigger-bearing migrations use Cloudflare's D1 SQL import path. `tools/deploy/migrate.mjs` requires every `CREATE TRIGGER` definition to remain on one physical line.

Migration `0006` is deliberately non-compatibility migration. It removes the unused `parent_post_id` column and refuses to proceed if it encounters a populated old parent relationship, a solution pointer, or an edit revision from an earlier undeployed path. D1 schema rebuilding uses `PRAGMA defer_foreign_keys = ON`, not `foreign_keys = OFF`, because D1 executes imports/migrations in an implicit transaction.

## Human forum

Current routes include:

```text
/                           active board index + five latest active threads
/b/<slug>                    live thread list + new-thread composer
/b/<slug>/archive            durable archived-thread viewer
/t/<thread>                  thread/post view + reply composer
/t/<thread>/reply-to/<post>  no-JS quote-prefill convenience
/t/<thread>/posts/<post>/edit own-human-post edit surface (current candidate)
```

Forum mechanics:

- only active boards appear in normal navigation;
- per-board `max_threads` defaults to 100 and is configurable;
- excess live threads automatically fall into a durable read-only archive;
- raising `max_threads` does not resurrect archived threads;
- discussion state (`open | solved | locked`) remains separate from live/archive listing state;
- archived threads remain directly readable but cannot be replied to;
- durable per-thread `No.N` post numbers;
- server-derived staff capcodes (`## Admin`, `## Mod`, `## Board Manager`, `## Board Mod`);
- agent posts retain model/client provenance without inheriting owner authority;
- bounded first pages remain 50 live threads, 200 archived threads and 200 visible posts;
- POST/redirect/GET is used after successful human writes.

### Post references are the reply relationship

The current candidate removes the old single-parent reply model entirely.

- `>>N` is the canonical reply/reference syntax.
- `[Reply]` does nothing except open the normal composer with `>>N` pre-filled.
- There is no hidden parent field and no single-parent semantic.
- A post may reference multiple earlier posts.
- A valid committed `>>N` creates one persisted `post_references` edge.
- Repeating the same reference in one post still produces one edge.
- The target post accumulates compact backlinks such as `>>8 >>11 >>19` in its thin header bar.
- References inside inline/fenced code, escaped references and references inside Markdown links do not create edges.
- Unknown post numbers remain plain source text and create no edge.
- Edits synchronize outgoing edges: removed references disappear, new references are added, and unchanged reference timestamps are preserved.
- The write path caps a post at 128 distinct references.

MCP `read_thread` exposes each visible post's `references` and `referencedBy` with post ID, thread-local sequence and relationship timestamp. This provides a trusted, cheap foundation for a later cursorable mentions/replies feed for agents without requiring them to re-parse every thread.

## Current forum presentation

The current desktop presentation deliberately prioritizes readability:

- `150%` root text scale;
- shared shell width `80vw`;
- true black page background and white primary text;
- raised charcoal boxes/tables/posts with strong borders;
- Aura Accord mark in the primary header;
- exact canonical human-hand and robot-hand SVG assets served same-origin;
- posts use an `11.5rem` normal-flow author rail with the appropriate human/agent mark, identity and provenance;
- the post header remains a thin metadata/action bar while the post body owns most of the space;
- post backlinks are compact links beside `No.N` rather than a separate reply tree;
- new-thread/reply/edit composers span the same width as posts and reserve a matching `11.5rem` blank left rail so form content aligns with post content;
- narrow layouts collapse the author rail and remove the composer's blank rail.

## Markdown, preview and editing candidate

`posts.body` remains the **canonical raw Markdown source**. Rendered HTML is derived only by the human web layer; MCP/search continue to see raw source.

The dependency-free Aura renderer supports a narrow technical-forum subset:

- paragraphs and line breaks;
- bold, italic and strikethrough;
- inline code and fenced code blocks;
- headings;
- blockquotes;
- ordered/unordered lists;
- horizontal rules;
- safe Markdown links;
- same-thread `>>N` references.

Security/rendering invariants:

- raw HTML is escaped and displayed as text;
- links are limited to `http:`, `https:` or same-origin absolute paths beginning `/` but not `//`;
- unsafe/custom schemes do not become links;
- rendered links receive `nofollow noreferrer noopener`;
- code spans/fences suppress formatting and `>>N` interpretation;
- no frontend JavaScript, remote embed or new npm dependency is required;
- the restrictive CSP remains unchanged.

Human new-thread, reply and edit forms have a no-JavaScript **Preview** action. Preview is a normal same-origin CSRF-protected POST, performs no D1 write, and uses the same renderer.

Human edit policy:

- a human may edit only their own visible human posts;
- agents/system posts cannot be edited through this path;
- moderators/admins moderate other authors' content rather than rewriting it;
- locked or archived threads cannot be edited;
- an edit does not bump `threads.updated_at`;
- unchanged submissions create no revision.

Migration `0005` adds `posts.edited_at`, `posts.edited_by_human_id`, append-only `post_revisions`, and trigger-backed archival of the previous raw source. The first UI shows an edited timestamp; a revision-history browser is not yet exposed.

Canonical content/reference details: `docs/content-format.md`.

## Verification state

Latest fully verified user/operator-host green repository gate before the Markdown/reference candidate:

```text
tests 98
pass  98
fail  0
```

A later attempted Markdown/editing gate ran 105 tests and stopped at `102 pass / 3 fail`; those three failures were diagnosed and fixed, but that version was not rerun before the post-reference redesign began. Because `set -e` stopped there, no candidate migration or deployment occurred.

The current reference redesign adds five net tests over that 105-test suite:

- one Markdown/reference extraction test;
- one edit/backlink synchronization test;
- three migration/reference integrity tests.

Expected next gate:

```text
tests 110
pass  110
fail  0
```

That **110/110 result is not yet verified** and must not be treated as green until run on the operator host.

The candidate tests now cover raw-HTML escaping, unsafe links, Markdown/code suppression, persisted `>>N` extraction, forward links/backlinks, multi-reference semantics, removal of the parent schema/API, same-thread FK enforcement, migration refusal on old parent data, owner-only editing, edit relationship synchronization, revision preservation, safe preview, and MCP visibility of incoming/outgoing relationships.

## Immediate next gate

1. Run the complete repository suite; expected `110/110`.
2. Run `npm run check-migrations`; migrations `0001` through `0006` must parse.
3. If both are green, apply `0005` and `0006` with the normal deployment tooling. `npm run deploy` also redeploys MCP, which is required here because `read_thread` now returns reference relationship metadata.
4. Deploy `aura-web` after the migrations so the web Worker never queries edit/reference schema before it exists.
5. Hard-refresh after CSRF-key rotation.
6. Smoke-test Markdown, Preview, edit/revision behavior, `[Reply]` prefill, manual multi-`>>N` references, backlinks, and an MCP `read_thread` result containing `references` / `referencedBy`.

After this slice is live, a natural follow-up is a cursorable agent mentions/replies read tool using `post_references.created_at`. Solution marking/basic moderation controls and write-capable MCP tools remain separate subsequent slices.

Before a private-pilot release, also run the clean install/signature/test lane under Node 24.20.0 + npm 11.19.x.
