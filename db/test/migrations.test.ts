import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const H = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const H2 = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const A = "agt_AAAAAAAAAAAAAAAAAAAAAA";
const A2 = "agt_BBBBBBBBBBBBBBBBBBBBBB";
const B = "brd_AAAAAAAAAAAAAAAAAAAAAA";
const T = "thr_AAAAAAAAAAAAAAAAAAAAAA";
const T2 = "thr_BBBBBBBBBBBBBBBBBBBBBB";
const P = "pst_AAAAAAAAAAAAAAAAAAAAAA";
const P2 = "pst_BBBBBBBBBBBBBBBBBBBBBB";
const C = "AAAAAAAAAAAAAAAA";

function db(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(migration);
  return database;
}

function seedHuman(database: DatabaseSync, id = H, provider = "cf-1"): void {
  database.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, 'x@example.test', 'member', 'active', 1, 1)`).run(id, provider);
}

function seedAgent(database: DatabaseSync, id = A, owner = H): void {
  database.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, 'agent', 'active', 2, 2)`).run(id, owner);
}

function seedBoard(database: DatabaseSync): void {
  database.prepare(`INSERT INTO boards (id, slug, title, created_at) VALUES (?, 're', 'Reverse engineering', 3)`).run(B);
}

test("initial migration applies cleanly with foreign keys enabled", () => {
  const database = db();
  const tables = database.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((row) => (row as { name: string }).name);
  assert.deepEqual(tables, [
    "agent_credential_capabilities", "agent_credentials", "agents", "audit_events", "boards",
    "humans", "idempotency_records", "posts", "threads",
  ]);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("human identity and agent ownership constraints fail closed", () => {
  const database = db();
  seedHuman(database);
  assert.throws(() => seedHuman(database, H2, "cf-1"), /UNIQUE/);
  assert.throws(() => database.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, 'bad', 'active', 2, 2)`).run(A, H2), /FOREIGN KEY/);
  assert.throws(() => database.prepare("UPDATE humans SET role='root' WHERE id=?").run(H), /CHECK/);
  database.close();
});

test("credentials store verifier-only data and capabilities are closed-set", () => {
  const database = db();
  seedHuman(database);
  seedAgent(database);
  const verifier = "a".repeat(64);
  database.prepare(`INSERT INTO agent_credentials
    (credential_id, agent_id, secret_verifier, status, created_at)
    VALUES (?, ?, ?, 'active', 3)`).run(C, A, verifier);
  database.prepare("INSERT INTO agent_credential_capabilities VALUES (?, 'read')").run(C);
  assert.throws(() => database.prepare("INSERT INTO agent_credential_capabilities VALUES (?, 'admin')").run(C), /CHECK/);
  assert.equal((database.prepare("SELECT secret_verifier FROM agent_credentials WHERE credential_id=?").get(C) as { secret_verifier: string }).secret_verifier, verifier);
  assert.throws(() => database.prepare("UPDATE agent_credentials SET status='revoked' WHERE credential_id=?").run(C), /CHECK/);
  database.prepare("UPDATE agent_credentials SET status='revoked', revoked_at=4 WHERE credential_id=?").run(C);
  database.close();
});

test("thread and post authors must resolve to the claimed principal kind", () => {
  const database = db();
  seedHuman(database);
  seedAgent(database);
  seedBoard(database);
  database.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, 't', 'open', 'human', ?, 4, 4)`).run(T, B, H);
  assert.throws(() => database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_agent_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'bad', 5)`).run(P, T, A), /CHECK/);
  database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'hello', 5)`).run(P, T, H);
  assert.throws(() => database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'dup sequence', 6)`).run(P2, T, H), /UNIQUE/);
  database.close();
});

test("a solved thread can only point at a post from that same thread", () => {
  const database = db();
  seedHuman(database);
  seedBoard(database);
  database.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, 'one', 'open', 'human', ?, 4, 4)`).run(T, B, H);
  database.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, 'two', 'open', 'human', ?, 4, 4)`).run(T2, B, H);
  database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'one', 5)`).run(P, T, H);
  database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'two', 5)`).run(P2, T2, H);
  database.prepare("UPDATE threads SET state='solved', solution_post_id=?, updated_at=6 WHERE id=?").run(P, T);
  assert.throws(() => database.prepare("UPDATE threads SET solution_post_id=? WHERE id=?").run(P2, T), /FOREIGN KEY/);
  assert.throws(() => database.prepare("UPDATE threads SET state='open' WHERE id=?").run(T), /CHECK/);
  database.close();
});

test("hidden posts require human attribution fields", () => {
  const database = db();
  seedHuman(database);
  seedBoard(database);
  database.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, 't', 'open', 'human', ?, 4, 4)`).run(T, B, H);
  database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'hello', 5)`).run(P, T, H);
  assert.throws(() => database.prepare("UPDATE posts SET visibility='hidden' WHERE id=?").run(P), /CHECK/);
  database.prepare("UPDATE posts SET visibility='hidden', hidden_by_human_id=?, hidden_at=6 WHERE id=?").run(H, P);
  database.close();
});

test("idempotency keys are unique per agent and store only request hash/result", () => {
  const database = db();
  seedHuman(database);
  seedAgent(database);
  seedAgent(database, A2, H);
  const hash = "b".repeat(64);
  const insert = database.prepare(`INSERT INTO idempotency_records
    (agent_id, idempotency_key, operation, request_hash, response_json, created_at, expires_at)
    VALUES (?, 'k1', 'reply', ?, '{"threadId":"x"}', 5, 3605)`);
  insert.run(A, hash);
  assert.throws(() => insert.run(A, hash), /UNIQUE/);
  insert.run(A2, hash);
  assert.throws(() => database.prepare(`INSERT INTO idempotency_records
    (agent_id, idempotency_key, operation, request_hash, response_json, created_at, expires_at)
    VALUES (?, 'k2', 'reply', ?, 'not-json', 5, 3605)`).run(A, hash), /CHECK/);
  database.close();
});

test("audit actors are structurally attributable without content bodies", () => {
  const database = db();
  seedHuman(database);
  seedAgent(database);
  database.prepare(`INSERT INTO audit_events
    (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id)
    VALUES (10, 'human', ?, 'agent_credential_revoked', 'agent', ?)`).run(H, A);
  assert.throws(() => database.prepare(`INSERT INTO audit_events
    (occurred_at, actor_kind, actor_human_id, actor_agent_id, action, target_kind, target_id)
    VALUES (10, 'human', ?, ?, 'bad', 'agent', ?)`).run(H, A, A), /CHECK/);
  database.prepare(`INSERT INTO audit_events
    (occurred_at, actor_kind, action, target_kind, target_id, metadata_json)
    VALUES (11, 'system', 'maintenance', 'database', 'main', '{}')`).run();
  database.close();
});

test("parent post references cannot cross thread boundaries", () => {
  const database = db();
  seedHuman(database);
  seedBoard(database);
  database.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, 'one', 'open', 'human', ?, 4, 4)`).run(T, B, H);
  database.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at)
    VALUES (?, ?, 'two', 'open', 'human', ?, 4, 4)`).run(T2, B, H);
  database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, created_at)
    VALUES (?, ?, 1, 'human', ?, 'parent', 5)`).run(P, T, H);
  assert.throws(() => database.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, parent_post_id, created_at)
    VALUES (?, ?, 1, 'human', ?, 'cross-thread', ?, 6)`).run(P2, T2, H, P), /FOREIGN KEY/);
  database.close();
});

test("planned query indexes exist", () => {
  const database = db();
  const indexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%'").all().map((row) => (row as { name: string }).name));
  for (const name of [
    "idx_posts_thread_sequence", "idx_threads_board_updated", "idx_threads_board_state_updated",
    "idx_agents_owner_status", "idx_agent_credentials_agent_status", "idx_idempotency_expires",
    "idx_audit_occurred", "idx_audit_human_actor", "idx_audit_agent_actor",
  ]) {
    assert(indexes.has(name), `missing index ${name}`);
  }
  database.close();
});
