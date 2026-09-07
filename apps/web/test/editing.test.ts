import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";
import { editHumanPost } from "../src/forum/edit-service.ts";
import { handleForumRequest } from "../src/forum/routes.ts";
import { createHumanThread } from "../src/forum/service.ts";

const migrations = [1, 2, 3, 4, 5].map((number) =>
  readFileSync(new URL(`../../../db/migrations/000${number}_${[
    "initial",
    "human_membership_and_board_staff",
    "unbound_member_invites",
    "board_thread_lifecycle",
    "post_edit_history",
  ][number - 1]}.sql`, import.meta.url), "utf8"));

const MEMBER = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const OTHER = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const BOARD = "brd_CCCCCCCCCCCCCCCCCCCCCC";

class StatementAdapter implements D1PreparedStatementLike {
  readonly database: DatabaseSync;
  readonly query: string;
  values: readonly unknown[] = [];

  constructor(database: DatabaseSync, query: string) {
    this.database = database;
    this.query = query;
  }

  bind(...values: readonly unknown[]): D1PreparedStatementLike {
    const next = new StatementAdapter(this.database, this.query);
    next.values = values;
    return next;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.database.prepare(this.query).get(...this.values);
    return row === undefined ? null : { ...row } as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    const rows = this.database.prepare(this.query).all(...this.values);
    return { results: rows.map((row) => ({ ...row })) as T[] };
  }

  async run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } } as D1ResultLike<T>;
  }
}

class DatabaseAdapter implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    for (const migration of migrations) this.sqlite.exec(migration);
  }

  prepare(query: string): D1PreparedStatementLike {
    return new StatementAdapter(this.sqlite, query);
  }

  async batch(statements: readonly D1PreparedStatementLike[]): Promise<readonly D1ResultLike[]> {
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const results: D1ResultLike[] = [];
      for (const statement of statements) {
        if (!(statement instanceof StatementAdapter)) throw new Error("unexpected statement adapter");
        const result = this.sqlite.prepare(statement.query).run(...statement.values);
        results.push({ success: true, meta: { changes: Number(result.changes) } });
      }
      this.sqlite.exec("COMMIT;");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

function seed(db: DatabaseAdapter): { member: HumanPrincipal; other: HumanPrincipal } {
  for (const [id, provider, name] of [[MEMBER, "member", "Member"], [OTHER, "other", "Other"]] as const) {
    db.sqlite.prepare(`INSERT INTO humans
      (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
      VALUES (?, 'cloudflare_access', ?, ?, ?, 'member', 'active', 1, 1)`)
      .run(id, provider, `${provider}@example.test`, name);
  }
  db.sqlite.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order)
    VALUES (?, 'general', 'General', '', 1, 'active', 1)`).run(BOARD);
  return {
    member: { kind: "human", humanId: MEMBER, role: "member", email: "member@example.test", displayName: "Member" },
    other: { kind: "human", humanId: OTHER, role: "member", email: "other@example.test", displayName: "Other" },
  };
}

async function thread(db: DatabaseAdapter, principal: HumanPrincipal, body = "original") {
  const result = await createHumanThread(db, principal, { boardId: BOARD, title: "Thread", body }, 100);
  assert(result.ok);
  if (!result.ok) throw new Error("thread creation failed");
  return result.value;
}

test("human edit archives prior raw source without bumping thread activity", async () => {
  const db = new DatabaseAdapter();
  const { member } = seed(db);
  const created = await thread(db, member);

  const result = await editHumanPost(db, member, {
    threadId: created.threadId,
    postId: created.postId,
    body: "**edited**",
  }, 200);
  assert.equal(result.ok, true);

  const post = db.sqlite.prepare("SELECT body, edited_at, edited_by_human_id FROM posts WHERE id=?").get(created.postId) as {
    body: string; edited_at: number; edited_by_human_id: string;
  };
  assert.deepEqual({ ...post }, { body: "**edited**", edited_at: 200, edited_by_human_id: MEMBER });
  assert.equal((db.sqlite.prepare("SELECT updated_at FROM threads WHERE id=?").get(created.threadId) as { updated_at: number }).updated_at, 100);
  const revision = db.sqlite.prepare("SELECT revision, body, replaced_at, replaced_by_human_id FROM post_revisions WHERE post_id=?").get(created.postId) as {
    revision: number; body: string; replaced_at: number; replaced_by_human_id: string;
  };
  assert.deepEqual({ ...revision }, { revision: 1, body: "original", replaced_at: 200, replaced_by_human_id: MEMBER });
  db.close();
});

test("editing is owner-only and stops when the thread is locked or archived", async () => {
  const db = new DatabaseAdapter();
  const { member, other } = seed(db);
  const created = await thread(db, member);

  const foreign = await editHumanPost(db, other, { threadId: created.threadId, postId: created.postId, body: "steal" }, 150);
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.error.code, "forbidden");

  db.sqlite.prepare("UPDATE threads SET state='locked' WHERE id=?").run(created.threadId);
  const locked = await editHumanPost(db, member, { threadId: created.threadId, postId: created.postId, body: "locked edit" }, 160);
  assert.equal(locked.ok, false);
  if (!locked.ok) assert.equal(locked.error.code, "thread_locked");

  db.sqlite.prepare("UPDATE threads SET state='open', listing_state='archived', archived_at=170 WHERE id=?").run(created.threadId);
  const archived = await editHumanPost(db, member, { threadId: created.threadId, postId: created.postId, body: "archive edit" }, 180);
  assert.equal(archived.ok, false);
  if (!archived.ok) assert.equal(archived.error.code, "thread_archived");
  db.close();
});

test("web edit flow renders markdown, previews safely, then saves with an edited marker", async () => {
  const db = new DatabaseAdapter();
  const { member } = seed(db);
  const created = await thread(db, member, "**hello**");
  const csrfKey = new Uint8Array(32).fill(23);
  const threadUrl = `https://aura.example/t/${created.threadId}`;

  const initial = await handleForumRequest(new Request(threadUrl), db, csrfKey, member, new URL(threadUrl));
  assert(initial);
  const initialHtml = await initial.text();
  assert.match(initialHtml, /<strong>hello<\/strong>/);
  assert.match(initialHtml, new RegExp(`/posts/${created.postId}/edit`));

  const editPath = `/t/${created.threadId}/posts/${created.postId}/edit`;
  const editUrl = `https://aura.example${editPath}`;
  const editGet = await handleForumRequest(new Request(editUrl), db, csrfKey, member, new URL(editUrl));
  assert(editGet);
  const editHtml = await editGet.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(editHtml)?.[1];
  assert(csrf);

  const draft = `<script>alert(1)</script>\n\n**new text**`;
  const preview = await handleForumRequest(new Request(editUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://aura.example" },
    body: new URLSearchParams({ csrf, body: draft, intent: "preview" }).toString(),
  }), db, csrfKey, member, new URL(editUrl));
  assert(preview);
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /class="markdown-preview"/);
  assert.match(previewHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(previewHtml, /<script>alert\(1\)<\/script>/);
  assert.match(previewHtml, /<strong>new text<\/strong>/);
  assert.equal((db.sqlite.prepare("SELECT body FROM posts WHERE id=?").get(created.postId) as { body: string }).body, "**hello**");

  const save = await handleForumRequest(new Request(editUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://aura.example" },
    body: new URLSearchParams({ csrf, body: draft, intent: "save" }).toString(),
  }), db, csrfKey, member, new URL(editUrl));
  assert(save);
  assert.equal(save.status, 303);
  assert.equal(save.headers.get("location"), `/t/${created.threadId}#p-${created.postId}`);
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM post_revisions WHERE post_id=?").get(created.postId) as { n: number }).n, 1);

  const after = await handleForumRequest(new Request(threadUrl), db, csrfKey, member, new URL(threadUrl));
  assert(after);
  const afterHtml = await after.text();
  assert.match(afterHtml, /edited <time/);
  assert.match(afterHtml, /<strong>new text<\/strong>/);
  assert.doesNotMatch(afterHtml, /<script>alert\(1\)<\/script>/);
  db.close();
});
