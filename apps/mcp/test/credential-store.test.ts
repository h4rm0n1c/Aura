import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createAgentCredential } from "../../../packages/core/src/auth/credentials.ts";
import { authenticateMcpAuthorization } from "../src/auth/bearer.ts";
import { loadAgentCredentialRecord } from "../src/db/credentials.ts";
import type { D1DatabaseLike, D1PreparedStatementLike } from "../src/db/d1.ts";

class StatementAdapter implements D1PreparedStatementLike {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: readonly unknown[];
  constructor(database: DatabaseSync, sql: string, values: readonly unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: readonly unknown[]): D1PreparedStatementLike { return new StatementAdapter(this.database, this.sql, values); }
  async first<T>(): Promise<T | null> { const { sql, params } = sqliteNamed(this.sql, this.values); return (this.database.prepare(sql).get(params) as T | undefined) ?? null; }
  async all<T>(): Promise<{ results: readonly T[] }> { const { sql, params } = sqliteNamed(this.sql, this.values); return { results: this.database.prepare(sql).all(params) as T[] }; }
}
class DbAdapter implements D1DatabaseLike {
  private readonly database: DatabaseSync;
  constructor(database: DatabaseSync) { this.database = database; }
  prepare(query:string):D1PreparedStatementLike{return new StatementAdapter(this.database,query);}
}

function sqliteNamed(sql: string, values: readonly unknown[]): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  values.forEach((value, index) => { params[`p${index + 1}`] = value; });
  return { sql: sql.replace(/\?(\d+)/g, (_match, number: string) => `:p${number}`), params };
}

const HUMAN = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const AGENT = "agt_AAAAAAAAAAAAAAAAAAAAAA";

test("D1 credential loader feeds coarse MCP auth and owner status fails closed", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE humans (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, owner_human_id TEXT, status TEXT);
    CREATE TABLE agent_credentials (credential_id TEXT PRIMARY KEY, agent_id TEXT, secret_verifier TEXT, status TEXT, expires_at INTEGER);
    CREATE TABLE agent_credential_capabilities (credential_id TEXT, capability TEXT);
  `);
  sqlite.prepare("INSERT INTO humans VALUES (?, 'active')").run(HUMAN);
  sqlite.prepare("INSERT INTO agents VALUES (?, ?, 'active')").run(AGENT, HUMAN);
  const live = await createAgentCredential((length) => new Uint8Array(length).fill(31));
  const expired = await createAgentCredential((length) => new Uint8Array(length).fill(32));
  const future = Math.floor(Date.now() / 1000) + 3600;
  sqlite.prepare("INSERT INTO agent_credentials VALUES (?, ?, ?, 'active', ?)").run(live.credentialId, AGENT, live.verifier, future);
  sqlite.prepare("INSERT INTO agent_credentials VALUES (?, ?, ?, 'active', 1)").run(expired.credentialId, AGENT, expired.verifier);
  sqlite.prepare("INSERT INTO agent_credential_capabilities VALUES (?, 'read')").run(live.credentialId);
  sqlite.prepare("INSERT INTO agent_credential_capabilities VALUES (?, 'read')").run(expired.credentialId);
  const db = new DbAdapter(sqlite);
  const lookup = (id:string) => loadAgentCredentialRecord(db,id);
  const ok = await authenticateMcpAuthorization(`Bearer ${live.token}`, lookup);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.principal.ownerHumanId, HUMAN);
  assert.deepEqual(await authenticateMcpAuthorization(`Bearer ${expired.token}`, lookup), { ok: false, reason: "authentication_failed" });

  sqlite.prepare("UPDATE humans SET status='disabled' WHERE id=?").run(HUMAN);
  assert.deepEqual(await authenticateMcpAuthorization(`Bearer ${live.token}`, lookup), { ok: false, reason: "authentication_failed" });
  sqlite.close();
});
