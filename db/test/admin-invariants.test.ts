import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const migration1 = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const A = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const B = "hum_BBBBBBBBBBBBBBBBBBBBBB";

function db(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(migration1);
  database.exec(migration2);
  return database;
}

function insertAdmin(database: DatabaseSync, id: string, providerId: string): void {
  database.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, 'admin', 'active', 1, 1)`)
    .run(id, providerId, `${providerId}@example.test`);
}

test("last active admin cannot be demoted, disabled, or deleted", () => {
  const database = db();
  insertAdmin(database, A, "cf-a");
  assert.throws(() => database.prepare("UPDATE humans SET role='member', updated_at=2 WHERE id=?").run(A), /last_active_admin_required/);
  assert.throws(() => database.prepare("UPDATE humans SET status='disabled', updated_at=2 WHERE id=?").run(A), /last_active_admin_required/);
  assert.throws(() => database.prepare("DELETE FROM humans WHERE id=?").run(A), /last_active_admin_required/);
  database.close();
});

test("one admin may step down when another active admin remains", () => {
  const database = db();
  insertAdmin(database, A, "cf-a");
  insertAdmin(database, B, "cf-b");
  database.prepare("UPDATE humans SET role='member', updated_at=2 WHERE id=?").run(A);
  assert.equal((database.prepare("SELECT role FROM humans WHERE id=?").get(A) as { role: string }).role, "member");
  assert.throws(() => database.prepare("UPDATE humans SET status='disabled', updated_at=3 WHERE id=?").run(B), /last_active_admin_required/);
  database.close();
});
