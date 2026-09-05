import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  authenticateAgentCredential,
  createAgentCredential,
  type AgentCredentialRecord,
} from "../../packages/core/src/auth/credentials.ts";

const migration = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const HUMAN_ID = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const AGENT_ID = "agt_AAAAAAAAAAAAAAAAAAAAAA";

function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(migration);
  database.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', 'cf-1', 'owner@example.test', 'member', 'active', 1, 1)`).run(HUMAN_ID);
  database.prepare(`INSERT INTO agents
    (id, owner_human_id, name, status, created_at, updated_at)
    VALUES (?, ?, 'test-agent', 'active', 2, 2)`).run(AGENT_ID, HUMAN_ID);
  return database;
}

function loadCredential(database: DatabaseSync, credentialId: string): AgentCredentialRecord | null {
  const row = database.prepare(`SELECT
      c.credential_id AS credentialId,
      c.agent_id AS agentId,
      c.secret_verifier AS verifier,
      c.status AS status,
      c.expires_at AS expiresAt,
      a.status AS agentStatus
    FROM agent_credentials c
    JOIN agents a ON a.id = c.agent_id
    WHERE c.credential_id = ?`).get(credentialId) as Record<string, unknown> | undefined;
  if (row === undefined) return null;

  const capabilities = database.prepare(`SELECT capability FROM agent_credential_capabilities
    WHERE credential_id = ? ORDER BY capability`).all(credentialId).map(
      (item) => (item as { capability: string }).capability,
    );

  return {
    credentialId: row.credentialId as string,
    agentId: row.agentId as string,
    verifier: row.verifier as string,
    status: row.status as "active" | "revoked",
    agentStatus: row.agentStatus as "active" | "disabled",
    expiresAt: row.expiresAt === null ? null : row.expiresAt as number,
    capabilities,
  };
}

async function storeCredential(database: DatabaseSync, fill: number) {
  const created = await createAgentCredential((length) => new Uint8Array(length).fill(fill));
  database.prepare(`INSERT INTO agent_credentials
    (credential_id, agent_id, secret_verifier, status, created_at)
    VALUES (?, ?, ?, 'active', 3)`).run(created.credentialId, AGENT_ID, created.verifier);
  database.prepare(
    "INSERT INTO agent_credential_capabilities (credential_id, capability) VALUES (?, 'read')",
  ).run(created.credentialId);
  return created;
}

test("credential rotation, revocation, and agent disable fail closed through stored state", async () => {
  const database = openDatabase();
  const first = await storeCredential(database, 11);
  const second = await storeCredential(database, 12);

  const firstRecord = loadCredential(database, first.credentialId);
  const secondRecord = loadCredential(database, second.credentialId);
  assert(firstRecord !== null && secondRecord !== null);
  assert.equal((await authenticateAgentCredential(first.token, firstRecord)).ok, true);
  assert.equal((await authenticateAgentCredential(second.token, secondRecord)).ok, true);

  database.prepare(
    "UPDATE agent_credentials SET status='revoked', revoked_at=4 WHERE credential_id=?",
  ).run(first.credentialId);
  const revoked = loadCredential(database, first.credentialId);
  const stillActive = loadCredential(database, second.credentialId);
  assert(revoked !== null && stillActive !== null);
  assert.deepEqual(await authenticateAgentCredential(first.token, revoked), {
    ok: false,
    reason: "revoked_credential",
  });
  assert.equal((await authenticateAgentCredential(second.token, stillActive)).ok, true);

  database.prepare("UPDATE agents SET status='disabled', updated_at=5 WHERE id=?").run(AGENT_ID);
  const disabled = loadCredential(database, second.credentialId);
  assert(disabled !== null);
  assert.deepEqual(await authenticateAgentCredential(second.token, disabled), {
    ok: false,
    reason: "disabled_agent",
  });

  const columns = database.prepare("PRAGMA table_info(agent_credentials)").all().map(
    (row) => (row as { name: string }).name,
  );
  assert.equal(columns.includes("secret"), false);
  assert.equal(columns.includes("token"), false);
  assert(columns.includes("secret_verifier"));
  database.close();
});
