import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { HumanPrincipal, HumanRole } from "../../../packages/core/src/auth/principals.ts";
import { handleAdminRequest } from "../src/admin/routes.ts";
import { listHumanInvitesForAdmin } from "../src/admin/invites.ts";
import { listHumansForAdmin, setHumanRole, setHumanStatus } from "../src/admin/humans.ts";
import { createMemberInvite } from "../src/membership/invites.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";

const migration1 = readFileSync(new URL("../../../db/migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../../../db/migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const migration3 = readFileSync(new URL("../../../db/migrations/0003_unbound_member_invites.sql", import.meta.url), "utf8");
const ADMIN_ID = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const ADMIN2_ID = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const MEMBER_ID = "hum_CCCCCCCCCCCCCCCCCCCCCC";
const AGENT_ID = "agt_AAAAAAAAAAAAAAAAAAAAAA";

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
    return this.runSync() as D1ResultLike<T>;
  }

  runSync(): D1ResultLike {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class DatabaseAdapter implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec(migration1);
    this.sqlite.exec(migration2);
    this.sqlite.exec(migration3);
  }

  prepare(query: string): D1PreparedStatementLike {
    return new StatementAdapter(this.sqlite, query);
  }

  async batch(statements: readonly D1PreparedStatementLike[]): Promise<readonly D1ResultLike[]> {
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof StatementAdapter)) throw new Error("unexpected statement adapter");
        return statement.runSync();
      });
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

function seedHuman(db: DatabaseAdapter, id: string, providerId: string, role: HumanRole): HumanPrincipal {
  const email = `${providerId}@example.test`;
  db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at, last_seen_at)
    VALUES (?, 'cloudflare_access', ?, ?, ?, ?, 'active', 1, 1, 1)`)
    .run(id, providerId, email, providerId, role);
  return { kind: "human", humanId: id, role, email, displayName: providerId };
}

test("site admin lists humans, changes role/status, and sees owned-agent counts", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN_ID, "admin", "admin");
  const member = seedHuman(db, MEMBER_ID, "member", "member");
  db.sqlite.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, 'Member Agent', 'active', 2, 2)`).run(AGENT_ID, MEMBER_ID);

  const denied = await listHumansForAdmin(db, member);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  const listed = await listHumansForAdmin(db, admin);
  assert.equal(listed.ok, true);
  if (!listed.ok) return db.close();
  const memberRow = listed.value.find((row) => row.humanId === MEMBER_ID);
  assert(memberRow);
  assert.equal(memberRow.agentCount, 1);
  assert.equal(memberRow.activeAgentCount, 1);

  const role = await setHumanRole(db, admin, MEMBER_ID, "moderator", 10);
  assert.deepEqual(role, { ok: true, value: { humanId: MEMBER_ID, role: "moderator" } });
  const status = await setHumanStatus(db, admin, MEMBER_ID, "disabled", 11);
  assert.deepEqual(status, { ok: true, value: { humanId: MEMBER_ID, status: "disabled" } });

  const stored = db.sqlite.prepare("SELECT role, status FROM humans WHERE id=?").get(MEMBER_ID) as { role: string; status: string };
  assert.deepEqual({ ...stored }, { role: "moderator", status: "disabled" });
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE action='human_role_changed'").get() as { n: number }).n, 1);
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE action='human_status_changed'").get() as { n: number }).n, 1);
  db.close();
});

test("last active administrator cannot disable or demote themselves through the service", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN_ID, "admin", "admin");

  const disabled = await setHumanStatus(db, admin, ADMIN_ID, "disabled", 10);
  assert.equal(disabled.ok, false);
  if (!disabled.ok) assert.equal(disabled.error.code, "conflict");

  const demoted = await setHumanRole(db, admin, ADMIN_ID, "member", 11);
  assert.equal(demoted.ok, false);
  if (!demoted.ok) assert.equal(demoted.error.code, "conflict");

  assert.deepEqual(
    { ...(db.sqlite.prepare("SELECT role, status FROM humans WHERE id=?").get(ADMIN_ID) as { role: string; status: string }) },
    { role: "admin", status: "active" },
  );
  db.close();
});

test("invite administration exposes effective expiry without exposing invite secrets", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN_ID, "admin", "admin");
  const created = await createMemberInvite(db, admin, "Person@Example.TEST", 100, 60);
  assert(created.ok);
  if (!created.ok) return db.close();

  const listed = await listHumanInvitesForAdmin(db, admin, 160);
  assert.equal(listed.ok, true);
  if (!listed.ok) return db.close();
  assert.equal(listed.value.length, 1);
  assert.equal(listed.value[0].email, "person@example.test");
  assert.equal(listed.value[0].binding, "email");
  assert.equal(listed.value[0].state, "expired");
  assert.equal("token" in listed.value[0], false);
  assert.equal("secretVerifier" in listed.value[0], false);
  db.close();
});

test("admin routes create one-time member invite URLs and protect ordinary members", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN_ID, "admin", "admin");
  const member = seedHuman(db, MEMBER_ID, "member", "member");
  const csrfKey = new Uint8Array(32).fill(19);

  const forbidden = await handleAdminRequest(
    new Request("https://aura.example/admin/users"),
    db,
    csrfKey,
    member,
    new URL("https://aura.example/admin/users"),
  );
  assert(forbidden);
  assert.equal(forbidden.status, 403);

  const get = await handleAdminRequest(
    new Request("https://aura.example/admin/invites"),
    db,
    csrfKey,
    admin,
    new URL("https://aura.example/admin/invites"),
  );
  assert(get);
  assert.equal(get.status, 200);
  const html = await get.text();
  assert.match(html, /Create DM invite link/);
  assert.match(html, /Create email-bound invitation/);
  const match = /name="csrf" value="([^"]+)"/.exec(html);
  assert(match);

  const post = await handleAdminRequest(
    new Request("https://aura.example/admin/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://aura.example",
      },
      body: new URLSearchParams({
        csrf: match[1],
        mode: "email",
        email: "newperson@example.test",
        ttl_days: "7",
      }).toString(),
    }),
    db,
    csrfKey,
    admin,
    new URL("https://aura.example/admin/invites"),
  );
  assert(post);
  assert.equal(post.status, 200);
  const createdHtml = await post.text();
  assert.match(createdHtml, /Copy this invitation URL now/);
  assert.match(createdHtml, /https:\/\/aura\.example\/invite\/aura\.invite\.v1\./);

  const row = db.sqlite.prepare("SELECT secret_verifier, email, status FROM human_invites WHERE email='newperson@example.test'").get() as {
    secret_verifier: string; email: string; status: string;
  };
  assert.match(row.secret_verifier, /^[0-9a-f]{64}$/);
  assert.equal(row.status, "pending");
  assert.equal(createdHtml.includes(row.secret_verifier), false);
  db.close();
});

test("one admin may demote another when an active administrator remains", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN_ID, "admin", "admin");
  seedHuman(db, ADMIN2_ID, "admin2", "admin");
  const changed = await setHumanRole(db, admin, ADMIN2_ID, "moderator", 10);
  assert.equal(changed.ok, true);
  assert.equal((db.sqlite.prepare("SELECT role FROM humans WHERE id=?").get(ADMIN2_ID) as { role: string }).role, "moderator");
  db.close();
});
