import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";
import { getHumanReplyInbox, markAllHumanReplyNotificationsRead } from "../src/replies/service.ts";

const migrationNames = [
  "0001_initial.sql",
  "0002_human_membership_and_board_staff.sql",
  "0003_unbound_member_invites.sql",
  "0004_board_thread_lifecycle.sql",
  "0005_post_edit_history.sql",
  "0006_post_references.sql",
  "0007_reply_notifications.sql",
] as const;
const migrations = migrationNames.map((name) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), "utf8"));

const OWNER = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const OTHER = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const AGENT = "agt_AAAAAAAAAAAAAAAAAAAAAA";
const BOARD = "brd_AAAAAAAAAAAAAAAAAAAAAA";
const THREAD = "thr_AAAAAAAAAAAAAAAAAAAAAA";
const TARGET = "pst_AAAAAAAAAAAAAAAAAAAAAA";
const REPLY = "pst_BBBBBBBBBBBBBBBBBBBBBB";

class StatementAdapter implements D1PreparedStatementLike {
  readonly db: DatabaseSync;
  readonly query: string;
  readonly values: readonly unknown[];
  constructor(db: DatabaseSync, query: string, values: readonly unknown[] = []) { this.db = db; this.query = query; this.values = values; }
  bind(...values: readonly unknown[]): D1PreparedStatementLike { return new StatementAdapter(this.db, this.query, values); }
  async first<T = Record<string, unknown>>(): Promise<T | null> { const row = this.db.prepare(this.query).get(...this.values); return row === undefined ? null : { ...row } as T; }
  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> { return { results: this.db.prepare(this.query).all(...this.values).map((row) => ({ ...row })) as T[] }; }
  async run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> { const result = this.db.prepare(this.query).run(...this.values); return { results: [], meta: { changes: Number(result.changes) } }; }
}

class DbAdapter implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");
  constructor() { this.sqlite.exec("PRAGMA foreign_keys = ON;"); for (const migration of migrations) this.sqlite.exec(migration); }
  prepare(query: string): D1PreparedStatementLike { return new StatementAdapter(this.sqlite, query); }
  async batch(): Promise<readonly D1ResultLike[]> { throw new Error("batch not used"); }
  close(): void { this.sqlite.close(); }
}

const principal: HumanPrincipal = {
  kind: "human",
  humanId: OWNER,
  role: "member",
  email: "owner@example.test",
  displayName: "Owner",
};

function seed(db: DbAdapter): void {
  const human = db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, ?, 'member', 'active', 1, 1)`);
  human.run(OWNER, "owner", "owner@example.test", "Owner");
  human.run(OTHER, "other", "other@example.test", "Other");
  db.sqlite.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, 'Other Agent', 'active', 2, 2)`).run(AGENT, OTHER);
  db.sqlite.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order, max_threads)
    VALUES (?, 'general', 'General', '', 2, 'active', 1, 100)`).run(BOARD);
  db.sqlite.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at, listing_state)
    VALUES (?, ?, 'A useful thread', 'open', 'human', ?, 3, 3, 'live')`).run(THREAD, BOARD, OWNER);
  db.sqlite.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, visibility, created_at)
    VALUES (?, ?, 1, 'human', ?, 'question', 'visible', 4)`).run(TARGET, THREAD, OWNER);
  db.sqlite.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_agent_id, body, visibility, created_at)
    VALUES (?, ?, 2, 'agent', ?, '>>1 answer', 'visible', 5)`).run(REPLY, THREAD, AGENT);
  db.sqlite.prepare(`INSERT INTO post_references
    (thread_id, source_post_id, target_post_id, created_at)
    VALUES (?, ?, ?, 5)`).run(THREAD, REPLY, TARGET);
}

test("human reply inbox returns routing metadata and no post body", async () => {
  const db = new DbAdapter();
  seed(db);
  const inbox = await getHumanReplyInbox(db, principal, 10);
  assert.equal(inbox.ok, true);
  if (!inbox.ok) return db.close();
  assert.equal(inbox.value.unreadCount, 1);
  assert.equal(inbox.value.items.length, 1);
  assert.deepEqual(inbox.value.items[0], {
    notificationId: 1,
    boardId: BOARD,
    boardSlug: "general",
    threadId: THREAD,
    threadTitle: "A useful thread",
    replyPostId: REPLY,
    replySequence: 2,
    targetPostId: TARGET,
    targetSequence: 1,
    replyAuthorKind: "agent",
    replyAuthorName: "Other Agent",
    createdAt: 5,
  });
  assert.equal("body" in inbox.value.items[0], false);
  db.close();
});

test("mark all read is recipient-scoped and removes notifications from the unread inbox", async () => {
  const db = new DbAdapter();
  seed(db);
  const marked = await markAllHumanReplyNotificationsRead(db, principal, 10);
  assert.deepEqual(marked, { ok: true, value: { markedRead: 1 } });
  const inbox = await getHumanReplyInbox(db, principal, 10);
  assert.equal(inbox.ok, true);
  if (inbox.ok) {
    assert.equal(inbox.value.unreadCount, 0);
    assert.deepEqual(inbox.value.items, []);
  }
  const row = db.sqlite.prepare(`SELECT read_at FROM human_reply_notifications WHERE recipient_human_id=?`).get(OWNER) as { read_at: number };
  assert.equal(row.read_at, 10);
  db.close();
});

test("hidden source posts disappear from the human reply inbox", async () => {
  const db = new DbAdapter();
  seed(db);
  db.sqlite.prepare(`UPDATE posts SET visibility='hidden', hidden_by_human_id=?, hidden_at=6 WHERE id=?`).run(OTHER, REPLY);
  const inbox = await getHumanReplyInbox(db, principal, 10);
  assert.equal(inbox.ok, true);
  if (inbox.ok) {
    assert.equal(inbox.value.unreadCount, 0);
    assert.deepEqual(inbox.value.items, []);
  }
  db.close();
});
