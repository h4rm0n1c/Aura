import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration1 = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const migration3 = readFileSync(new URL("../migrations/0003_unbound_member_invites.sql", import.meta.url), "utf8");
const migration4 = readFileSync(new URL("../migrations/0004_board_thread_lifecycle.sql", import.meta.url), "utf8");

const H = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const B = "brd_AAAAAAAAAAAAAAAAAAAAAA";
const THREAD_IDS = [
  "thr_AAAAAAAAAAAAAAAAAAAAAA",
  "thr_BBBBBBBBBBBBBBBBBBBBBB",
  "thr_CCCCCCCCCCCCCCCCCCCCCC",
] as const;

function baseDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(migration1);
  db.exec(migration2);
  db.exec(migration3);
  db.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', 'cf-human', 'human@example.test', 'member', 'active', 1, 1)`).run(H);
  db.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order)
    VALUES (?, 'general', 'General', '', 2, 'active', 10)`).run(B);
  return db;
}

function insertThread(db: DatabaseSync, id: string, createdAt: number, updatedAt = createdAt): void {
  db.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, ?, 'open', 'human', ?, ?, ?)`).run(id, B, `Thread ${createdAt}`, H, createdAt, updatedAt);
}

test("migration 0004 adds constrained board capacity and durable archive columns", () => {
  const db = baseDb();
  db.exec(migration4);

  const boardColumns = new Set(db.prepare("PRAGMA table_info(boards)").all().map((row) => (row as { name: string }).name));
  const threadColumns = new Set(db.prepare("PRAGMA table_info(threads)").all().map((row) => (row as { name: string }).name));
  assert(boardColumns.has("max_threads"));
  assert(threadColumns.has("listing_state"));
  assert(threadColumns.has("archived_at"));
  assert.equal((db.prepare("SELECT max_threads FROM boards WHERE id=?").get(B) as { max_threads: number }).max_threads, 100);

  const indexes = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map((row) => (row as { name: string }).name));
  assert(indexes.has("idx_threads_board_listing_updated"));
  assert(indexes.has("idx_threads_board_archive"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.throws(() => db.prepare("UPDATE boards SET max_threads=0 WHERE id=?").run(B), /CHECK/);
  db.close();
});

test("migration 0004 archives pre-existing overflow by activity order", () => {
  const db = baseDb();
  for (let index = 0; index < THREAD_IDS.length; index += 1) {
    insertThread(db, THREAD_IDS[index], 10 + index, 10 + index);
  }

  // Keep the production migration at its real default of 100; for this isolated
  // backfill proof only, substitute a two-thread default in the in-memory copy.
  db.exec(migration4.replace("DEFAULT 100", "DEFAULT 2"));

  const rows = db.prepare(`SELECT id, listing_state, archived_at FROM threads
    WHERE board_id=? ORDER BY updated_at DESC, id DESC`).all(B) as { id: string; listing_state: string; archived_at: number | null }[];
  assert.deepEqual(rows.map((row) => row.listing_state), ["live", "live", "archived"]);
  assert.equal(rows[2].archived_at, 10);
  db.close();
});

test("board max automatically drops bottom threads and never resurrects archive history", () => {
  const db = baseDb();
  db.exec(migration4);
  db.prepare("UPDATE boards SET max_threads=2 WHERE id=?").run(B);

  insertThread(db, THREAD_IDS[0], 10, 10);
  insertThread(db, THREAD_IDS[1], 11, 11);
  insertThread(db, THREAD_IDS[2], 12, 12);

  const afterCreate = db.prepare(`SELECT id, listing_state FROM threads
    WHERE board_id=? ORDER BY updated_at DESC, id DESC`).all(B) as { id: string; listing_state: string }[];
  assert.deepEqual(afterCreate.map((row) => [row.id, row.listing_state]), [
    [THREAD_IDS[2], "live"],
    [THREAD_IDS[1], "live"],
    [THREAD_IDS[0], "archived"],
  ]);

  db.prepare("UPDATE boards SET max_threads=1 WHERE id=?").run(B);
  assert.equal((db.prepare("SELECT listing_state FROM threads WHERE id=?").get(THREAD_IDS[1]) as { listing_state: string }).listing_state, "archived");
  assert.equal((db.prepare("SELECT listing_state FROM threads WHERE id=?").get(THREAD_IDS[2]) as { listing_state: string }).listing_state, "live");

  db.prepare("UPDATE boards SET max_threads=3 WHERE id=?").run(B);
  const liveCount = db.prepare("SELECT COUNT(*) AS n FROM threads WHERE board_id=? AND listing_state='live'").get(B) as { n: number };
  assert.equal(liveCount.n, 1);

  assert.throws(() => db.prepare("UPDATE threads SET listing_state='archived', archived_at=NULL WHERE id=?").run(THREAD_IDS[2]), /CHECK/);
  db.close();
});
