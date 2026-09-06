import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration1 = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const migration3 = readFileSync(new URL("../migrations/0003_unbound_member_invites.sql", import.meta.url), "utf8");
const ADMIN = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const INVITE1 = "AAAAAAAAAAAAAAAA";
const INVITE2 = "BBBBBBBBBBBBBBBB";
const VERIFIER = "a".repeat(64);

function openDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(migration1);
  db.exec(migration2);
  return db;
}

test("migration 0003 preserves existing invites and permits verifier-only unbound member links", () => {
  const db = openDatabase();
  db.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', 'cf-admin', 'admin@example.test', 'admin', 'active', 1, 1)`).run(ADMIN);
  db.prepare(`INSERT INTO human_invites
    (invite_id, secret_verifier, email, kind, initial_role, status, created_by_human_id, created_at, expires_at)
    VALUES (?, ?, 'person@example.test', 'member', 'member', 'pending', ?, 2, 3602)`).run(INVITE1, VERIFIER, ADMIN);

  db.exec(migration3);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  const preserved = db.prepare("SELECT email, status FROM human_invites WHERE invite_id=?").get(INVITE1) as { email: string | null; status: string };
  assert.deepEqual({ ...preserved }, { email: "person@example.test", status: "pending" });

  db.prepare(`INSERT INTO human_invites
    (invite_id, secret_verifier, email, kind, initial_role, status, created_by_human_id, created_at, expires_at)
    VALUES (?, ?, NULL, 'member', 'member', 'pending', ?, 3, 3603)`).run(INVITE2, VERIFIER, ADMIN);
  assert.equal((db.prepare("SELECT email FROM human_invites WHERE invite_id=?").get(INVITE2) as { email: string | null }).email, null);

  assert.throws(() => db.prepare(`INSERT INTO human_invites
    (invite_id, secret_verifier, email, kind, initial_role, status, created_at, expires_at)
    VALUES ('CCCCCCCCCCCCCCCC', ?, NULL, 'bootstrap_admin', 'admin', 'pending', 4, 3604)`).run(VERIFIER), /CHECK/);
  db.close();
});