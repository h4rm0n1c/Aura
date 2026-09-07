import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { HumanPrincipal } from "../../../packages/core/src/auth/principals.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";
import {
  createOwnedAgent,
  listOwnedAgents,
  revokeOwnedAgentCredential,
  rotateOwnedAgentCredential,
  setOwnedAgentReplyNotificationSettings,
  setOwnedAgentStatus,
} from "../src/agents/service.ts";

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
const HUMAN_ID = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const OTHER_ID = "hum_BBBBBBBBBBBBBBBBBBBBBB";

class StatementAdapter implements D1PreparedStatementLike {
  readonly database: DatabaseSync;
  readonly query: string;
  values: readonly unknown[] = [];
  constructor(database: DatabaseSync, query: string) { this.database = database; this.query = query; }
  bind(...values: readonly unknown[]): D1PreparedStatementLike { const next = new StatementAdapter(this.database, this.query); next.values = values; return next; }
  async first<T = Record<string, unknown>>(): Promise<T | null> { const row = this.database.prepare(this.query).get(...this.values); return row === undefined ? null : { ...row } as T; }
  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> { const rows = this.database.prepare(this.query).all(...this.values); return { results: rows.map((row) => ({ ...row })) as T[] }; }
  async run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> { return this.runSync() as D1ResultLike<T>; }
  runSync(): D1ResultLike<Record<string, unknown>> { const result = this.database.prepare(this.query).run(...this.values); return { results: [], meta: { changes: Number(result.changes) } }; }
}

class DatabaseAdapter implements D1DatabaseLike {
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

function seedHuman(db: DatabaseAdapter, id: string, providerId: string): void {
  db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, NULL, 'member', 'active', 1, 1)`)
    .run(id, providerId, `${providerId}@example.test`);
}

const owner: HumanPrincipal = {
  kind: "human",
  humanId: HUMAN_ID,
  role: "member",
  email: "owner@example.test",
  displayName: null,
};
const otherAdmin: HumanPrincipal = {
  kind: "human",
  humanId: OTHER_ID,
  role: "admin",
  email: "admin@example.test",
  displayName: null,
};

test("human creates an owned read-only agent credential and secret is verifier-only", async () => {
  const db = new DatabaseAdapter();
  seedHuman(db, HUMAN_ID, "owner");
  const created = await createOwnedAgent(db, owner, { name: "Helper", model: "Model X", client: "Client Y" }, 100);
  assert.equal(created.ok, true);
  if (!created.ok) return db.close();
  assert.match(created.value.token, /^aura\.v1\./);

  const row = db.sqlite.prepare(`SELECT a.owner_human_id, a.name, c.secret_verifier, cc.capability
    FROM agents a
    JOIN agent_credentials c ON c.agent_id=a.id
    JOIN agent_credential_capabilities cc ON cc.credential_id=c.credential_id
    WHERE a.id=?`).get(created.value.agentId) as {
      owner_human_id: string; name: string; secret_verifier: string; capability: string;
    };
  assert.equal(row.owner_human_id, HUMAN_ID);
  assert.equal(row.name, "Helper");
  assert.equal(row.capability, "read");
  assert.match(row.secret_verifier, /^[0-9a-f]{64}$/);
  assert.equal(row.secret_verifier.includes(created.value.token), false);

  const listed = await listOwnedAgents(db, owner);
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.equal(listed.value.length, 1);
    assert.equal(listed.value[0].agentId, created.value.agentId);
    assert.equal(listed.value[0].credentials.length, 1);
    assert.equal(listed.value[0].notifyRepliesToAgent, true);
    assert.equal(listed.value[0].notifyRepliesToOwner, false);
  }
  db.close();
});

test("credential rotation revokes the old credential and admin cannot mint for another owner", async () => {
  const db = new DatabaseAdapter();
  seedHuman(db, HUMAN_ID, "owner");
  seedHuman(db, OTHER_ID, "admin");
  const created = await createOwnedAgent(db, owner, { name: "Helper", model: "", client: "" }, 100);
  assert(created.ok);
  if (!created.ok) return db.close();

  const denied = await rotateOwnedAgentCredential(db, otherAdmin, created.value.agentId, 101);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  const rotated = await rotateOwnedAgentCredential(db, owner, created.value.agentId, 102);
  assert.equal(rotated.ok, true);
  if (!rotated.ok) return db.close();
  assert.notEqual(rotated.value.credentialId, created.value.credentialId);
  assert.equal((db.sqlite.prepare("SELECT status FROM agent_credentials WHERE credential_id=?").get(created.value.credentialId) as { status: string }).status, "revoked");
  assert.equal((db.sqlite.prepare("SELECT status FROM agent_credentials WHERE credential_id=?").get(rotated.value.credentialId) as { status: string }).status, "active");
  db.close();
});

test("owner can disable, re-enable, and revoke an agent credential", async () => {
  const db = new DatabaseAdapter();
  seedHuman(db, HUMAN_ID, "owner");
  const created = await createOwnedAgent(db, owner, { name: "Helper", model: null, client: null }, 100);
  assert(created.ok);
  if (!created.ok) return db.close();

  const disabled = await setOwnedAgentStatus(db, owner, created.value.agentId, "disabled", 101);
  assert.equal(disabled.ok, true);
  assert.equal((db.sqlite.prepare("SELECT status FROM agents WHERE id=?").get(created.value.agentId) as { status: string }).status, "disabled");

  const enabled = await setOwnedAgentStatus(db, owner, created.value.agentId, "active", 102);
  assert.equal(enabled.ok, true);
  assert.equal((db.sqlite.prepare("SELECT status FROM agents WHERE id=?").get(created.value.agentId) as { status: string }).status, "active");

  const revoked = await revokeOwnedAgentCredential(db, owner, created.value.agentId, created.value.credentialId, 103);
  assert.equal(revoked.ok, true);
  assert.equal((db.sqlite.prepare("SELECT status FROM agent_credentials WHERE credential_id=?").get(created.value.credentialId) as { status: string }).status, "revoked");
  db.close();
});

test("only the owning human can change an agent's reply notification sources", async () => {
  const db = new DatabaseAdapter();
  seedHuman(db, HUMAN_ID, "owner");
  seedHuman(db, OTHER_ID, "admin");
  const created = await createOwnedAgent(db, owner, { name: "Helper", model: null, client: null }, 100);
  assert(created.ok);
  if (!created.ok) return db.close();

  const denied = await setOwnedAgentReplyNotificationSettings(db, otherAdmin, created.value.agentId, {
    repliesToAgent: false,
    repliesToOwner: true,
  }, 101);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  const changed = await setOwnedAgentReplyNotificationSettings(db, owner, created.value.agentId, {
    repliesToAgent: false,
    repliesToOwner: true,
  }, 102);
  assert.deepEqual(changed, {
    ok: true,
    value: { agentId: created.value.agentId, notifyRepliesToAgent: false, notifyRepliesToOwner: true },
  });
  const stored = db.sqlite.prepare(`SELECT notify_replies_to_agent, notify_replies_to_owner
    FROM agents WHERE id=?`).get(created.value.agentId) as { notify_replies_to_agent: number; notify_replies_to_owner: number };
  assert.deepEqual({ ...stored }, { notify_replies_to_agent: 0, notify_replies_to_owner: 1 });
  const audit = db.sqlite.prepare(`SELECT action FROM audit_events
    WHERE target_id=? ORDER BY id DESC LIMIT 1`).get(created.value.agentId) as { action: string };
  assert.equal(audit.action, "agent_reply_notifications_changed");
  db.close();
});
