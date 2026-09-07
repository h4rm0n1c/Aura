import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migrationNames = [
  "0001_initial.sql",
  "0002_human_membership_and_board_staff.sql",
  "0003_unbound_member_invites.sql",
  "0004_board_thread_lifecycle.sql",
  "0005_post_edit_history.sql",
  "0006_post_references.sql",
] as const;
const migrations = migrationNames.map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));

const H = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const B = "brd_AAAAAAAAAAAAAAAAAAAAAA";
const T1 = "thr_AAAAAAAAAAAAAAAAAAAAAA";
const T2 = "thr_BBBBBBBBBBBBBBBBBBBBBB";
const P1 = "pst_AAAAAAAAAAAAAAAAAAAAAA";
const P2 = "pst_BBBBBBBBBBBBBBBBBBBBBB";
const P3 = "pst_CCCCCCCCCCCCCCCCCCCCCC";

function databaseThrough(count: number): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const migration of migrations.slice(0, count)) db.exec(migration);
  return db;
}

function seedHumanBoard(db: DatabaseSync): void {
  db.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', 'person', 'person@example.test', 'member', 'active', 1, 1)`).run(H);
  db.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order)
    VALUES (?, 'general', 'General', '', 1, 'active', 1)`).run(B);
}

function seedThread(db: DatabaseSync, threadId: string, title: string): void {
  db.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, ?, 'open', 'human', ?, 2, 2)`).run(threadId, B, title, H);
}

function seedPost(db: DatabaseSync, postId: string, threadId: string, sequence: number, body: string): void {
  db.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, visibility, created_at)
    VALUES (?, ?, ?, 'human', ?, ?, 'visible', 3)`).run(postId, threadId, sequence, H, body);
}

test("migration 0006 removes parent replies and creates indexed post references", () => {
  const db = databaseThrough(6);
  const columns = new Set(db.prepare("PRAGMA table_info(posts)").all().map((row) => (row as { name: string }).name));
  assert.equal(columns.has("parent_post_id"), false);
  assert.equal(columns.has("edited_at"), true);
  assert.equal(columns.has("edited_by_human_id"), true);

  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => (row as { name: string }).name));
  assert(tables.has("post_references"));
  const indexes = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().map((row) => (row as { name: string }).name));
  assert(indexes.has("idx_post_references_target"));
  assert(indexes.has("idx_post_references_thread_source"));
  assert(indexes.has("idx_posts_thread_sequence"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("migration 0006 refuses any populated legacy parent relationship", () => {
  const db = databaseThrough(5);
  seedHumanBoard(db);
  seedThread(db, T1, "Thread");
  seedPost(db, P1, T1, 1, "one");
  db.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, parent_post_id, visibility, created_at)
    VALUES (?, ?, 2, 'human', ?, 'two', ?, 'visible', 4)`).run(P2, T1, H, P1);

  assert.throws(() => db.exec(migrations[5]), /CHECK constraint failed/);
  const columns = new Set(db.prepare("PRAGMA table_info(posts)").all().map((row) => (row as { name: string }).name));
  assert(columns.has("parent_post_id"));
  db.close();
});

test("post references are same-thread edges and duplicate references collapse", () => {
  const db = databaseThrough(6);
  seedHumanBoard(db);
  seedThread(db, T1, "One");
  seedThread(db, T2, "Two");
  seedPost(db, P1, T1, 1, "one");
  seedPost(db, P2, T1, 2, ">>1 two");
  seedPost(db, P3, T2, 1, "other");

  db.prepare(`INSERT INTO post_references
    (thread_id, source_post_id, target_post_id, created_at)
    VALUES (?, ?, ?, 5)`).run(T1, P2, P1);
  assert.throws(() => db.prepare(`INSERT INTO post_references
    (thread_id, source_post_id, target_post_id, created_at)
    VALUES (?, ?, ?, 6)`).run(T1, P2, P1), /UNIQUE/);
  assert.throws(() => db.prepare(`INSERT INTO post_references
    (thread_id, source_post_id, target_post_id, created_at)
    VALUES (?, ?, ?, 6)`).run(T1, P2, P3), /FOREIGN KEY/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});
