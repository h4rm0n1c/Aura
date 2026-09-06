import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createHumanInviteToken } from "../../../packages/core/src/auth/invites.ts";
import type { HumanPrincipal, VerifiedHumanIdentity } from "../../../packages/core/src/auth/principals.ts";
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1ResultLike,
} from "../src/db/d1.ts";
import {
  acceptHumanInvite,
  createMemberInvite,
  createMemberLinkInvite,
  revokeMemberInvite,
} from "../src/membership/invites.ts";

const migration1 = readFileSync(new URL("../../../db/migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../../../db/migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const migration3 = readFileSync(new URL("../../../db/migrations/0003_unbound_member_invites.sql", import.meta.url), "utf8");
const ADMIN_ID = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const MEMBER_ID = "hum_BBBBBBBBBBBBBBBBBBBBBB";

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
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  runSync(): D1ResultLike {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class DatabaseAdapter implements D1DatabaseLike {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
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

  close(): void {
    this.sqlite.close();
  }
}

function seedAdmin(db: DatabaseAdapter): HumanPrincipal {
  db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', 'cf-admin', 'admin@example.test', 'Admin', 'admin', 'active', 1, 1)`).run(ADMIN_ID);
  return {
    kind: "human",
    humanId: ADMIN_ID,
    role: "admin",
    email: "admin@example.test",
    displayName: "Admin",
  };
}

const ordinaryMember: HumanPrincipal = {
  kind: "human",
  humanId: MEMBER_ID,
  role: "member",
  email: "member@example.test",
  displayName: null,
};

function identity(email: string, providerId = "cf-new"): VerifiedHumanIdentity {
  return {
    provider: "cloudflare_access",
    providerId,
    email,
    displayName: "New Person",
  };
}

test("site admin creates verifier-only email-bound member invite and ordinary member cannot", async () => {
  const db = new DatabaseAdapter();
  const admin = seedAdmin(db);

  const denied = await createMemberInvite(db, ordinaryMember, "person@example.test", 100);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  const created = await createMemberInvite(db, admin, " Person@Example.TEST ", 100);
  assert.equal(created.ok, true);
  if (!created.ok) return db.close();
  assert.equal(created.value.email, "person@example.test");
  assert.equal(created.value.binding, "email");
  assert.match(created.value.token, /^aura\.invite\.v1\./);

  const row = db.sqlite.prepare(`SELECT secret_verifier, email, initial_role FROM human_invites WHERE invite_id=?`).get(created.value.inviteId) as {
    secret_verifier: string;
    email: string;
    initial_role: string;
  };
  assert.match(row.secret_verifier, /^[0-9a-f]{64}$/);
  assert.equal(row.secret_verifier.includes(created.value.token), false);
  assert.equal(row.email, "person@example.test");
  assert.equal(row.initial_role, "member");
  db.close();
});

test("email-bound invite acceptance requires the matching Access email", async () => {
  const db = new DatabaseAdapter();
  const admin = seedAdmin(db);
  const created = await createMemberInvite(db, admin, "person@example.test", 100);
  assert(created.ok);
  if (!created.ok) return db.close();

  const wrong = await acceptHumanInvite(db, identity("other@example.test", "cf-wrong"), created.value.token, 101);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.error.code, "not_found");
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM humans").get() as { n: number }).n, 1);

  const accepted = await acceptHumanInvite(db, identity("PERSON@example.TEST"), created.value.token, 102);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return db.close();
  assert.equal(accepted.value.role, "member");

  const human = db.sqlite.prepare(`SELECT provider_id, email, role, status FROM humans WHERE id=?`).get(accepted.value.humanId) as {
    provider_id: string;
    email: string;
    role: string;
    status: string;
  };
  assert.deepEqual({ ...human }, {
    provider_id: "cf-new",
    email: "person@example.test",
    role: "member",
    status: "active",
  });
  assert.equal((db.sqlite.prepare("SELECT status FROM human_invites WHERE invite_id=?").get(created.value.inviteId) as { status: string }).status, "accepted");
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE action='human_invite_accepted'").get() as { n: number }).n, 1);

  const reused = await acceptHumanInvite(db, identity("person@example.test", "cf-second"), created.value.token, 103);
  assert.equal(reused.ok, false);
  if (!reused.ok) assert.equal(reused.error.code, "not_found");
  db.close();
});

test("unbound DM invite is claimed by the first authenticated Cloudflare identity and remains one-time", async () => {
  const db = new DatabaseAdapter();
  const admin = seedAdmin(db);

  const denied = await createMemberLinkInvite(db, ordinaryMember, 100);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  const created = await createMemberLinkInvite(db, admin, 100);
  assert.equal(created.ok, true);
  if (!created.ok) return db.close();
  assert.equal(created.value.email, null);
  assert.equal(created.value.binding, "link");

  const stored = db.sqlite.prepare("SELECT email, secret_verifier FROM human_invites WHERE invite_id=?").get(created.value.inviteId) as {
    email: string | null;
    secret_verifier: string;
  };
  assert.equal(stored.email, null);
  assert.match(stored.secret_verifier, /^[0-9a-f]{64}$/);

  const accepted = await acceptHumanInvite(db, identity("whatever-address@example.test", "cf-link-user"), created.value.token, 101);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return db.close();
  const human = db.sqlite.prepare("SELECT provider_id, email, role FROM humans WHERE id=?").get(accepted.value.humanId) as {
    provider_id: string;
    email: string;
    role: string;
  };
  assert.deepEqual({ ...human }, {
    provider_id: "cf-link-user",
    email: "whatever-address@example.test",
    role: "member",
  });

  const second = await acceptHumanInvite(db, identity("second@example.test", "cf-link-second"), created.value.token, 102);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error.code, "not_found");
  db.close();
});

test("revoked and expired member invites cannot be accepted", async () => {
  const db = new DatabaseAdapter();
  const admin = seedAdmin(db);

  const revokedInvite = await createMemberLinkInvite(db, admin, 100);
  assert(revokedInvite.ok);
  if (!revokedInvite.ok) return db.close();
  const revoked = await revokeMemberInvite(db, admin, revokedInvite.value.inviteId, 101);
  assert.equal(revoked.ok, true);
  const acceptRevoked = await acceptHumanInvite(db, identity("anything@example.test"), revokedInvite.value.token, 102);
  assert.equal(acceptRevoked.ok, false);
  if (!acceptRevoked.ok) assert.equal(acceptRevoked.error.code, "not_found");

  const short = await createMemberInvite(db, admin, "expired@example.test", 200, 60);
  assert(short.ok);
  if (!short.ok) return db.close();
  const acceptExpired = await acceptHumanInvite(db, identity("expired@example.test", "cf-expired"), short.value.token, 260);
  assert.equal(acceptExpired.ok, false);
  if (!acceptExpired.ok) assert.equal(acceptExpired.error.code, "not_found");
  db.close();
});

test("bootstrap admin invite stays email-bound and no later bootstrap is allowed", async () => {
  const db = new DatabaseAdapter();
  const created = await createHumanInviteToken((length) => new Uint8Array(length).fill(9));
  db.sqlite.prepare(`INSERT INTO human_invites
    (invite_id, secret_verifier, email, kind, initial_role, status, created_at, expires_at)
    VALUES (?, ?, 'owner@example.test', 'bootstrap_admin', 'admin', 'pending', 10, 3610)`).run(created.inviteId, created.verifier);

  const accepted = await acceptHumanInvite(db, identity("owner@example.test", "cf-owner"), created.token, 11);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return db.close();
  assert.equal(accepted.value.role, "admin");
  assert.equal((db.sqlite.prepare("SELECT role FROM humans WHERE id=?").get(accepted.value.humanId) as { role: string }).role, "admin");

  const later = await createHumanInviteToken((length) => new Uint8Array(length).fill(10));
  assert.throws(() => db.sqlite.prepare(`INSERT INTO human_invites
    (invite_id, secret_verifier, email, kind, initial_role, status, created_at, expires_at)
    VALUES (?, ?, 'later@example.test', 'bootstrap_admin', 'admin', 'pending', 20, 3620)`).run(later.inviteId, later.verifier), /bootstrap_admin_requires_empty_instance/);
  db.close();

  const emptyDb = new DatabaseAdapter();
  assert.throws(() => emptyDb.sqlite.prepare(`INSERT INTO human_invites
    (invite_id, secret_verifier, email, kind, initial_role, status, created_at, expires_at)
    VALUES (?, ?, NULL, 'bootstrap_admin', 'admin', 'pending', 20, 3620)`).run(later.inviteId, later.verifier), /CHECK/);
  emptyDb.close();
});