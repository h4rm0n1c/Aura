import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { AgentPrincipal } from "../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";
import { replyAsAgent } from "../src/write/reply.ts";

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
const OP = "pst_AAAAAAAAAAAAAAAAAAAAAA";
const KEY = "reply-test-key-0001";

class StatementAdapter implements D1PreparedStatementLike {
  readonly database: DatabaseSync;
  readonly query: string;
  readonly values: readonly unknown[];
  constructor(database: DatabaseSync, query: string, values: readonly unknown[] = []) {
    this.database = database;
    this.query = query;
    this.values = values;
  }
  bind(...values: readonly unknown[]): D1PreparedStatementLike {
    return new StatementAdapter(this.database, this.query, values);
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
    return this.runSync() as D1ResultLike<T>;
  }
  runSync(): D1ResultLike<Record<string, unknown>> {
    const result = this.database.prepare(this.query).run(...this.values);
    return { results: [], meta: { changes: Number(result.changes) } };
  }
}

class DbAdapter implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");
  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    for (const migration of migrations) this.sqlite.exec(migration);
  }
  prepare(query: string): D1PreparedStatementLike { return new StatementAdapter(this.sqlite, query); }
  async batch(statements: readonly D1PreparedStatementLike[]): Promise<readonly D1ResultLike[]> {
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof StatementAdapter)) throw new Error("unexpected test statement adapter");
        return statement.runSync();
      });
      this.sqlite.exec("COMMIT;");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }
  close(): void { this.sqlite.close(); }
}

function seed(db: DbAdapter): void {
  const human = db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, ?, 'member', 'active', 1, 1)`);
  human.run(OWNER, "owner", "owner@example.test", "Owner");
  human.run(OTHER, "other", "other@example.test", "Other");
  db.sqlite.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, 'Helper', 'active', 2, 2)`).run(AGENT, OWNER);
  db.sqlite.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order, max_threads)
    VALUES (?, 'general', 'General', '', 2, 'active', 1, 100)`).run(BOARD);
  db.sqlite.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_human_id, created_at, updated_at, listing_state)
    VALUES (?, ?, 'Conversation', 'open', 'human', ?, 3, 3, 'live')`).run(THREAD, BOARD, OTHER);
  db.sqlite.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, visibility, created_at)
    VALUES (?, ?, 1, 'human', ?, 'hello agent', 'visible', 4)`).run(OP, THREAD, OTHER);
}

function principal(capabilities: readonly ("read" | "post")[] = ["read", "post"]): AgentPrincipal {
  return {
    kind: "agent",
    agentId: AGENT,
    ownerHumanId: OWNER,
    credentialId: "AAAAAAAAAAAAAAAA",
    capabilities,
  };
}

test("agent reply atomically posts, persists >> references, follows the thread, and notifies the human target", async () => {
  const db = new DbAdapter();
  seed(db);
  const result = await replyAsAgent(db, principal(), {
    threadId: THREAD,
    content: ">>1 Thanks — checking that now.",
    confidence: "high",
    idempotencyKey: KEY,
  }, 10);
  assert.equal(result.ok, true);
  if (!result.ok) return db.close();

  const post = db.sqlite.prepare(`SELECT id, sequence, author_kind, author_agent_id, body, confidence
    FROM posts WHERE id=?`).get(result.value.postId) as Record<string, unknown>;
  assert.deepEqual({ ...post }, {
    id: result.value.postId,
    sequence: 2,
    author_kind: "agent",
    author_agent_id: AGENT,
    body: ">>1 Thanks — checking that now.",
    confidence: "high",
  });
  const ref = db.sqlite.prepare(`SELECT source_post_id, target_post_id FROM post_references`).get() as Record<string, unknown>;
  assert.deepEqual({ ...ref }, { source_post_id: result.value.postId, target_post_id: OP });
  const follow = db.sqlite.prepare(`SELECT source FROM agent_thread_follows WHERE agent_id=? AND thread_id=?`).get(AGENT, THREAD) as { source: string };
  assert.equal(follow.source, "participated");
  const humanNotice = db.sqlite.prepare(`SELECT recipient_human_id, source_post_id, target_post_id
    FROM human_reply_notifications`).get() as Record<string, unknown>;
  assert.deepEqual({ ...humanNotice }, {
    recipient_human_id: OTHER,
    source_post_id: result.value.postId,
    target_post_id: OP,
  });
  const idem = db.sqlite.prepare(`SELECT operation, response_json FROM idempotency_records
    WHERE agent_id=? AND idempotency_key=?`).get(AGENT, KEY) as { operation: string; response_json: string };
  assert.equal(idem.operation, "reply");
  assert.deepEqual(JSON.parse(idem.response_json), result.value);
  assert.equal((db.sqlite.prepare("SELECT updated_at FROM threads WHERE id=?").get(THREAD) as { updated_at: number }).updated_at, 10);
  db.close();
});

test("identical retry returns the first post while changed content with the same key conflicts", async () => {
  const db = new DbAdapter();
  seed(db);
  const request = {
    threadId: THREAD,
    content: ">>1 Same logical reply",
    idempotencyKey: KEY,
  };
  const first = await replyAsAgent(db, principal(), request, 10);
  assert(first.ok);
  if (!first.ok) return db.close();
  const retry = await replyAsAgent(db, principal(), request, 11);
  assert.deepEqual(retry, first);
  assert.equal((db.sqlite.prepare("SELECT COUNT(*) AS n FROM posts WHERE thread_id=?").get(THREAD) as { n: number }).n, 2);
  assert.equal((db.sqlite.prepare("SELECT COUNT(*) AS n FROM post_references").get() as { n: number }).n, 1);

  const conflict = await replyAsAgent(db, principal(), {
    ...request,
    content: ">>1 different body",
  }, 12);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "conflict");
  db.close();
});

test("read-only agent and non-writable thread states fail closed", async () => {
  const db = new DbAdapter();
  seed(db);
  const denied = await replyAsAgent(db, principal(["read"]), {
    threadId: THREAD,
    content: ">>1 nope",
    idempotencyKey: KEY,
  }, 10);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  db.sqlite.prepare("UPDATE threads SET state='locked' WHERE id=?").run(THREAD);
  const locked = await replyAsAgent(db, principal(), {
    threadId: THREAD,
    content: ">>1 nope",
    idempotencyKey: "reply-test-key-0002",
  }, 11);
  assert.equal(locked.ok, false);
  if (!locked.ok) assert.equal(locked.error.code, "thread_locked");
  db.close();
});
