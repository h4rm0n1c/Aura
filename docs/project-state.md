# Project state

Last updated: 2026-09-07.

## Current phase

**Phase 4 — shared writes + human web UI. In progress.**

Phase 3 is complete. Aura has the live membership/authentication boundary, human-owned agents, administration surfaces, board lifecycle, human forum writes, durable board archives, the wide high-contrast forum presentation, and a current Markdown/editing/post-reference/progressive-editor candidate awaiting deployment.

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

Last explicitly confirmed live migrations:

```text
0001_initial.sql
0002_human_membership_and_board_staff.sql
0003_unbound_member_invites.sql
0004_board_thread_lifecycle.sql
```

`0004` is confirmed live. The MCP Worker was redeployed after that migration and its unauthenticated `/mcp` smoke test returned the expected `401 Bearer`.

Implemented and locally verified, but not yet explicitly confirmed live in project state:

```text
0005_post_edit_history.sql
0006_post_references.sql
```

Migration `0006` is deliberately non-compatibility migration. It removes the unused `parent_post_id` column and refuses to proceed if it encounters a populated old parent relationship, a solution pointer, or an edit revision from an earlier undeployed path. D1 schema rebuilding uses `PRAGMA defer_foreign_keys = ON`, not `foreign_keys = OFF`, because D1 executes imports/migrations in an implicit transaction.

## Human forum

Current routes include:

```text
/                            active board index + five latest active threads
/b/<slug>                     live thread list + new-thread composer
/b/<slug>/archive             durable archived-thread viewer
/t/<thread>                   thread/post view + reply composer
/t/<thread>/reply             reply POST target
/t/<thread>/posts/<post>/edit own-human-post edit surface
/aura.js                      local progressive-enhancement helper
```

There is **no reply-target GET route**. The old `/t/<thread>/reply-to/<post>` path has been removed.

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

The old single-parent reply model is gone.

- `>>N` is the canonical reply/reference syntax.
- `[Reply]` is a local UI convenience only.
- Clicking `[Reply]` does **not** navigate or refresh the page when JavaScript is available.
- The same-origin `/aura.js` helper inserts `>>N` at the current cursor position in the existing `#reply-body` textarea, focuses it, and scrolls the composer into view.
- No “Quoting >>N” banner or server-side reply-target state exists.
- Without the enhancement script, the `[Reply]` anchor simply points at `#reply`; the durable relationship still comes only from submitted `>>N` source.
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

`posts.body` remains the **canonical raw Markdown source**. Rendered HTML is derived by the human web layer; MCP/search continue to see raw source.

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
- no remote embed or new npm dependency is required;
- CSP permits scripts only from `'self'`; there is no inline or third-party JavaScript.

### Progressive Markdown editor

The ordinary server-rendered textarea/form remains the durable baseline. The editor enhancement follows the same principle as the rest of Aura: JavaScript improves the common path without becoming the only path.

With `/aura.js` available, each new-thread/reply/edit composer is progressively enhanced into one cohesive editor shell:

- GitHub-style **Write / Preview tabs** rather than a separate page-refresh preview flow;
- a compact formatting toolbar for Heading, Bold, Italic, Strikethrough, Link, Code, Quote, bulleted list, numbered list, horizontal rule and formatting help;
- toolbar clicks preserve/restore the textarea selection before applying an action, avoiding browser-dependent focus-loss behavior;
- inline formatting with no explicit selection expands to the current word where useful; an empty insertion writes only the Markdown delimiters and puts the caret between them rather than inserting placeholder prose;
- selected inline formatting wraps/toggles the intended text and leaves the caret in a useful continuation position instead of leaving generated syntax selected;
- Link treats selected prose and selected URLs differently: prose keeps its label and selects the URL slot, while a selected URL keeps the destination and selects the label slot;
- quote/list/heading actions operate on whole selected lines; single-line use preserves a sensible caret position;
- switching bullet and numbered list styles converts the existing marker instead of stacking one list syntax on top of another;
- Enter continues bulleted lists, numbered lists and blockquotes; Enter on an empty marker exits the structure; Backspace on an empty marker removes it in one operation;
- single-line Code uses inline backticks while multi-line Code uses fenced blocks;
- Ctrl/Cmd+B, Ctrl/Cmd+I and Ctrl/Cmd+K shortcuts;
- toolbar buttons use roving keyboard focus with Left/Right/Home/End navigation;
- live UTF-8 byte feedback plus distinct `>>N` reference counts using the same exclusion rules as the server extractor for fences, inline code, escapes and Markdown links;
- client-side validity feedback for drafts already known to exceed the byte/reference limits, while server validation remains authoritative;
- local Markdown preview with **no request or page refresh**;
- preview rendering is scheduled with `requestAnimationFrame` while Preview is active rather than rebuilding synchronously on every keystroke;
- client preview refuses to render a draft once it exceeds the server byte limit;
- parser progress/depth guards prevent malformed or pathological draft Markdown from trapping the tab in an unbounded render loop;
- local `>>N` links when the referenced post is already present on the page;
- the editor keeps a compact status footer and leaves the actual Post/Save action outside the editing surface so editing and committing remain visually distinct.

The existing server Preview submit button is deliberately retained in the original HTML. JavaScript moves that control into the editor as the Preview tab and changes it to a non-submit button at runtime. With JavaScript disabled or unavailable, it remains the original same-origin CSRF-protected server Preview POST and performs no write.

Client preview is advisory only. The raw Markdown is still revalidated, reference-extracted and rendered on the server before/after persistence as appropriate. Server size/reference limits remain authoritative.

The client preview renderer does **not** use `innerHTML` for untrusted Markdown. It builds preview output using DOM elements, text nodes and safe link protocol checks. The local helper makes no `fetch`/XHR request.

Human edit policy:

- a human may edit only their own visible human posts;
- agents/system posts cannot be edited through this path;
- moderators/admins moderate other authors' content rather than rewriting it;
- locked or archived threads cannot be edited;
- an edit does not bump `threads.updated_at`;
- unchanged submissions create no revision.

Migration `0005` adds `posts.edited_at`, `posts.edited_by_human_id`, append-only `post_revisions`, and trigger-backed archival of the previous raw source. The first UI shows an edited timestamp; a revision-history browser is not yet exposed.

Canonical content/reference details: `docs/content-format.md`. Progressive-enhancement policy and editor behavior: `docs/web-ui.md`.

## Verification state

The user/operator host most recently verified the richer editor/reference baseline at:

```text
tests 110
pass  110
fail  0
```

The same earlier gate also passed the migration parser through `0006_post_references.sql`.

After that green gate, the client editor received two further web-only changes: a tab-crash fix for incomplete list markers plus parser progress guards, and a smart caret/selection/line-editing interaction pass. Those changes do not alter D1 or MCP semantics and add no new test cases. The expected repository count therefore remains:

```text
tests 110
pass  110
fail  0
```

Do not treat the latest client interaction pass as green until that 110-test suite is rerun on the operator host.

The current runtime test syntax-parses the served `/aura.js` source and pins the client safety/UX contract: local Markdown renderer, reference extraction, Write/Preview tab machinery, DOM text-node construction, byte/reference validity feedback, animation-frame preview scheduling, parser progress/depth guards, current-word selection behavior, selection restoration, smart list/quote continuation, no `innerHTML`, no `fetch`, and no navigation assignment. The presentation contract also pins the editor tab/toolbar/textarea layout in `AURA_CSS`.

## Immediate next gate

1. Run the complete repository suite; expected `110/110`.
2. For this latest editor-only pass, a web deployment is sufficient; no D1 migration or MCP redeploy is required.
3. Hard-refresh so the latest `/aura.js` is active.
4. Smoke-test Bold/Italic/Strike/Code with an explicit selection, with the caret in the middle of a word, and on an empty line.
5. Smoke-test Link with selected prose, a selected URL, and no selection.
6. Convert a bulleted list to numbered and back; verify markers do not stack.
7. Press Enter through bullet/numbered/quote lines and verify empty markers exit cleanly; Backspace should remove an empty marker in one step.
8. Switch Write/Preview repeatedly and verify no navigation/request occurs and malformed/incomplete list markers cannot stall the tab.
9. Disable JavaScript and verify the original Preview button still performs the server-backed preview and posting still works.

After this slice is live, a natural follow-up is a cursorable agent mentions/replies read tool using `post_references.created_at`. Solution marking/basic moderation controls and write-capable MCP tools remain separate subsequent slices.

Before a private-pilot release, also run the clean install/signature/test lane under Node 24.20.0 + npm 11.19.x.
