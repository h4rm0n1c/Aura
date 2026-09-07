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
  "0007_reply_notifications.sql",
] as const;
const migrations = migrationNames.map((name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));

const H1 = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const H2 = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const A1 = "agt_AAAAAAAAAAAAAAAAAAAAAA";
const A2 = "agt_BBBBBBBBBBBBBBBBBBBBBB";
const B = "brd_AAAAAAAAAAAAAAAAAAAAAA";
const T = "thr_AAAAAAAAAAAAAAAAAAAAAA";
const P1 = "pst_AAAAAAAAAAAAAAAAAAAAAA";
const P2 = "pst_BBBBBBBBBBBBBBBBBBBBBB";
const P3 = "pst_CCCCCCCCCCCCCCCCCCCCCC";
const P4 = "pst_DDDDDDDDDDDDDDDDDDDDDD";
const P5 = "pst_EEEEEEEEEEEEEEEEEEEEEE";
const P6 = "pst_FFFFFFFFFFFFFFFFFFFFFF";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const migration of migrations) db.exec(migration);
  return db;
}

function seed(db: DatabaseSync): void {
  const human = db.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, ?, 'member', 'active', 1, 1)`);
  human.run(H1, "owner", "owner@example.test", "Owner");
  human.run(H2, "other", "other@example.test", "Other");

  const agent = db.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', 2, 2)`);
  agent.run(A1, H1, "Owner Agent");
  agent.run(A2, H2, "Other Agent");

  db.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order, max_threads)
    VALUES (?, 'general', 'General', '', 2, 'active', 1, 100)`).run(B);
  db.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at, listing_state)
    VALUES (?, ?, 'Thread', 'open', 'human', ?, 3, 3, 'live')`).run(T, B, H1);
}

function humanPost(db: DatabaseSync, id: string, sequence: number, humanId: string, body = "post"): void {
  db.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, visibility, created_at)
    VALUES (?, ?, ?, 'human', ?, ?, 'visible', ?)`).run(id, T, sequence, humanId, body, sequence + 3);
}

function agentPost(db: DatabaseSync, id: string, sequence: number, agentId: string, body = "post"): void {
  db.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_agent_id, body, visibility, created_at)
    VALUES (?, ?, ?, 'agent', ?, ?, 'visible', ?)`).run(id, T, sequence, agentId, body, sequence + 3);
}

function reference(db: DatabaseSync, source: string, target: string, at: number): void {
  db.prepare(`INSERT INTO post_references
    (thread_id, source_post_id, target_post_id, created_at)
    VALUES (?, ?, ?, ?)`).run(T, source, target, at);
}

test("agent notification settings default to own-post replies on and owner-post replies off", () => {
  const db = database();
  seed(db);
  const rows = db.prepare(`SELECT id, notify_replies_to_agent, notify_replies_to_owner
    FROM agents ORDER BY id`).all() as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: A1, notify_replies_to_agent: 1, notify_replies_to_owner: 0 },
    { id: A2, notify_replies_to_agent: 1, notify_replies_to_owner: 0 },
  ]);
  db.close();
});

test("a reference to another human creates one durable human reply notification but self-replies do not", () => {
  const db = database();
  seed(db);
  humanPost(db, P1, 1, H1, "owner post");
  humanPost(db, P2, 2, H2, ">>1 reply");
  humanPost(db, P3, 3, H1, ">>1 self follow-up");

  reference(db, P2, P1, 10);
  reference(db, P3, P1, 11);

  const rows = db.prepare(`SELECT source_post_id, target_post_id, recipient_human_id, created_at, read_at
    FROM human_reply_notifications`).all() as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { source_post_id: P2, target_post_id: P1, recipient_human_id: H1, created_at: 10, read_at: null },
  ]);
  db.close();
});

test("replies to an agent post notify that agent by default and never notify it about its own self-reference", () => {
  const db = database();
  seed(db);
  agentPost(db, P1, 1, A1, "agent post");
  humanPost(db, P2, 2, H2, ">>1 human reply");
  agentPost(db, P3, 3, A1, ">>1 agent follow-up");

  reference(db, P2, P1, 10);
  reference(db, P3, P1, 11);

  const rows = db.prepare(`SELECT source_post_id, target_post_id, recipient_agent_id, reason, created_at
    FROM agent_reply_notifications`).all() as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { source_post_id: P2, target_post_id: P1, recipient_agent_id: A1, reason: "reply_to_agent_post", created_at: 10 },
  ]);
  db.close();
});

test("owner-post notifications are opt-in per agent and apply only to future references", () => {
  const db = database();
  seed(db);
  humanPost(db, P1, 1, H1, "owner post");
  humanPost(db, P2, 2, H2, ">>1 before opt-in");
  humanPost(db, P3, 3, H2, ">>1 after opt-in");
  agentPost(db, P4, 4, A1, ">>1 own agent reply");

  reference(db, P2, P1, 10);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM agent_reply_notifications").get() as { n: number }).n, 0);

  db.prepare("UPDATE agents SET notify_replies_to_owner=1, updated_at=11 WHERE id=?").run(A1);
  reference(db, P3, P1, 12);
  reference(db, P4, P1, 13);

  const rows = db.prepare(`SELECT source_post_id, recipient_agent_id, reason
    FROM agent_reply_notifications ORDER BY id`).all() as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { source_post_id: P3, recipient_agent_id: A1, reason: "reply_to_owner_post" },
  ]);
  db.close();
});

test("removing a canonical post reference removes its derived human and agent notifications", () => {
  const db = database();
  seed(db);
  db.prepare("UPDATE agents SET notify_replies_to_owner=1 WHERE id=?").run(A1);
  humanPost(db, P1, 1, H1, "owner post");
  humanPost(db, P2, 2, H2, ">>1 reply");
  reference(db, P2, P1, 10);

  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM human_reply_notifications").get() as { n: number }).n, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM agent_reply_notifications").get() as { n: number }).n, 1);

  db.prepare("DELETE FROM post_references WHERE source_post_id=? AND target_post_id=?").run(P2, P1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM human_reply_notifications").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM agent_reply_notifications").get() as { n: number }).n, 0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});
