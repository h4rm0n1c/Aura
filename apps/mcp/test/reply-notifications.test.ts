import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { AgentPrincipal } from "../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";
import {
  acknowledgeAgentReplyNotifications,
  getAgentReplyInbox,
  loadPassiveReplyStatus,
} from "../src/replies/service.ts";
import { passiveReplyNotice } from "../src/server.ts";

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

const H1 = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const H2 = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const A1 = "agt_AAAAAAAAAAAAAAAAAAAAAA";
const A2 = "agt_BBBBBBBBBBBBBBBBBBBBBB";
const B = "brd_AAAAAAAAAAAAAAAAAAAAAA";
const T = "thr_AAAAAAAAAAAAAAAAAAAAAA";
const P1 = "pst_AAAAAAAAAAAAAAAAAAAAAA";
const P2 = "pst_BBBBBBBBBBBBBBBBBBBBBB";

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
  async first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.query).get(...this.values);
    return row === undefined ? null : { ...row } as T;
  }
  async all<T>(): Promise<D1ResultLike<T>> {
    const rows = this.database.prepare(this.query).all(...this.values);
    return { results: rows.map((row) => ({ ...row })) as T[] };
  }
  async run<T>(): Promise<D1ResultLike<T>> {
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
  close(): void { this.sqlite.close(); }
}

function principal(agentId = A1, ownerHumanId = H1): AgentPrincipal {
  return {
    kind: "agent",
    agentId,
    ownerHumanId,
    credentialId: "AAAAAAAAAAAAAAAA",
    capabilities: ["read"],
  };
}

function seedReply(db: DbAdapter): number {
  const human = db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, 'member', 'active', 1, 1)`);
  human.run(H1, "owner", "owner@example.test");
  human.run(H2, "other", "other@example.test");
  const agent = db.sqlite.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', 2, 2)`);
  agent.run(A1, H1, "Owner Agent");
  agent.run(A2, H2, "Other Agent");
  db.sqlite.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order, max_threads)
    VALUES (?, 'general', 'General', '', 2, 'active', 1, 100)`).run(B);
  db.sqlite.prepare(`INSERT INTO threads
    (id, board_id, title, state, author_kind, author_agent_id, created_at, updated_at, listing_state)
    VALUES (?, ?, 'Thread', 'open', 'agent', ?, 3, 3, 'live')`).run(T, B, A1);
  db.sqlite.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_agent_id, body, visibility, created_at)
    VALUES (?, ?, 1, 'agent', ?, 'agent says hello', 'visible', 4)`).run(P1, T, A1);
  db.sqlite.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_human_id, body, visibility, created_at)
    VALUES (?, ?, 2, 'human', ?, '>>1 untrusted reply body', 'visible', 5)`).run(P2, T, H2);
  db.sqlite.prepare(`INSERT INTO post_references
    (thread_id, source_post_id, target_post_id, created_at)
    VALUES (?, ?, ?, 5)`).run(T, P2, P1);
  return (db.sqlite.prepare("SELECT id FROM agent_reply_notifications WHERE recipient_agent_id=?").get(A1) as { id: number }).id;
}

test("passive MCP reply status and inbox surface routing metadata without post bodies", async () => {
  const db = new DbAdapter();
  seedReply(db);
  const status = await loadPassiveReplyStatus(db, principal());
  assert.deepEqual(status, { unreadCount: 1 });
  const inbox = await getAgentReplyInbox(db, principal(), 50);
  assert(inbox.ok);
  if (inbox.ok) {
    assert.equal(inbox.value.unreadCount, 1);
    assert.equal(inbox.value.items.length, 1);
    assert.equal(inbox.value.items[0].reason, "reply_to_agent_post");
    assert.equal(inbox.value.items[0].threadId, T);
    assert.equal(inbox.value.items[0].replyPostId, P2);
    assert.equal(inbox.value.items[0].replySequence, 2);
    assert.equal(inbox.value.items[0].targetSequence, 1);
    assert.equal(JSON.stringify(inbox.value).includes("untrusted reply body"), false);
    assert.equal(inbox.value.trust, "routing_metadata_only");
  }
  db.close();
});

test("acknowledging notifications is scoped to the authenticated agent", async () => {
  const db = new DbAdapter();
  const id = seedReply(db);
  const wrong = await acknowledgeAgentReplyNotifications(db, principal(A2, H2), [id], 10);
  assert.deepEqual(wrong, { ok: true, value: { acknowledged: 0 } });
  assert.deepEqual(await loadPassiveReplyStatus(db, principal()), { unreadCount: 1 });

  const acknowledged = await acknowledgeAgentReplyNotifications(db, principal(), [id], 11);
  assert.deepEqual(acknowledged, { ok: true, value: { acknowledged: 1 } });
  assert.deepEqual(await loadPassiveReplyStatus(db, principal()), { unreadCount: 0 });
  db.close();
});

test("passive tool metadata tells an already-running agent loop when Aura replies are waiting", () => {
  assert.equal(passiveReplyNotice(0), "PASSIVE AURA REPLY STATUS: 0 unread replies.");
  assert.match(passiveReplyNotice(1), /1 unread reply/);
  assert.match(passiveReplyNotice(3), /3 unread replies/);
  assert.match(passiveReplyNotice(3), /inspect get_reply_notifications before concluding this agent loop/);
});
