#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "../..");
const MIGRATIONS_DIR = resolve(REPO_ROOT, "db/migrations");
const API_BASE = "https://api.cloudflare.com/client/v4";
const PHASE4_MIGRATION = "0002_human_membership_and_board_staff.sql";
const PHASE4_OBJECT_NAMES = Object.freeze([
  "human_invites",
  "board_staff",
  "idx_human_invites_email_status",
  "idx_human_invites_expires",
  "idx_human_invites_pending_bootstrap",
  "idx_board_staff_human",
  "trg_human_invites_bootstrap_empty",
  "trg_humans_keep_last_active_admin_update",
  "trg_humans_keep_last_active_admin_delete",
]);

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function loadConfig() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  if (!/^[0-9a-f]{32}$/.test(accountId)) {
    fail("CLOUDFLARE_ACCOUNT_ID must be a 32-character lowercase hexadecimal account ID.");
  }
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const d1Name = process.env.AURA_D1_NAME?.trim() || "aura";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(d1Name)) {
    fail("AURA_D1_NAME must be 1-64 letters, digits, underscores, or hyphens.");
  }
  return Object.freeze({ accountId, apiToken, d1Name });
}

async function cfRequest(config, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${config.apiToken}`);
  headers.set("Accept", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      fail(`Cloudflare returned non-JSON data for ${options.method || "GET"} ${path} (HTTP ${response.status}).`);
    }
  }
  if (!response.ok || payload?.success === false) {
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const detail = errors
      .map((entry) => (typeof entry?.message === "string" ? entry.message : null))
      .filter(Boolean)
      .slice(0, 5)
      .join("; ");
    fail(`Cloudflare API rejected ${options.method || "GET"} ${path} (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return payload;
}

async function cfJson(config, path, method, body) {
  return cfRequest(config, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function findOrCreateD1(config) {
  const params = new URLSearchParams({ name: config.d1Name, per_page: "10" });
  const listed = await cfRequest(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/d1/database?${params}`,
  );
  const exact = (Array.isArray(listed?.result) ? listed.result : []).filter(
    (database) => database?.name === config.d1Name,
  );
  if (exact.length > 1) fail(`More than one D1 database is named ${config.d1Name}; refusing to guess.`);
  if (exact.length === 1) {
    if (typeof exact[0].uuid !== "string" || !exact[0].uuid) fail("Existing D1 database has no UUID.");
    return { id: exact[0].uuid, created: false };
  }

  const created = await cfJson(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/d1/database`,
    "POST",
    { name: config.d1Name },
  );
  const id = created?.result?.uuid;
  if (typeof id !== "string" || !id) fail("Cloudflare created D1 but did not return its UUID.");
  return { id, created: true };
}

async function queryD1(config, databaseId, sql, params = []) {
  const payload = await cfJson(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    "POST",
    { sql, params },
  );
  const results = Array.isArray(payload?.result) ? payload.result : [];
  if (results.some((result) => result?.success === false)) fail("D1 returned an unsuccessful query result.");
  return results;
}

async function batchD1(config, databaseId, statements) {
  if (!statements.length) fail("Refusing to send an empty D1 batch.");
  const payload = await cfJson(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    "POST",
    { batch: statements.map((sql) => ({ sql, params: [] })) },
  );
  const results = Array.isArray(payload?.result) ? payload.result : [];
  if (results.length !== statements.length) {
    fail(`D1 batch returned ${results.length} results for ${statements.length} statements.`);
  }
  if (results.some((result) => result?.success === false)) fail("D1 returned an unsuccessful migration statement.");
  return results;
}

function rowsFrom(results) {
  const rows = [];
  for (const result of results) {
    if (Array.isArray(result?.results)) rows.push(...result.results);
  }
  return rows;
}

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+[A-Za-z0-9._-]*\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function splitMigrationSql(sql, fileName) {
  if (!sql.trim()) fail(`Migration ${fileName} is empty.`);
  if (sql.includes("\r")) fail(`Migration ${fileName} contains CR characters; SQL migrations must use LF line endings.`);

  const statements = [];
  let current = [];

  for (const rawLine of sql.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;

    if (/^CREATE\s+TRIGGER\b/i.test(line)) {
      if (current.length) {
        fail(`Migration ${fileName} starts a trigger before the previous statement ended.`);
      }
      if (!line.endsWith(";")) {
        fail(`Migration ${fileName} has a multiline trigger; Aura remote migrations require CREATE TRIGGER on one physical line.`);
      }
      statements.push(line);
      continue;
    }

    current.push(rawLine);
    if (line.endsWith(";")) {
      statements.push(current.join("\n").trim());
      current = [];
    }
  }

  if (current.length) fail(`Migration ${fileName} ends with an incomplete SQL statement.`);
  if (!statements.length) fail(`Migration ${fileName} contains no SQL statements.`);
  return statements;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function readAppliedMigrations(config, databaseId) {
  await queryD1(
    config,
    databaseId,
    "CREATE TABLE IF NOT EXISTS aura_schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
  );
  const result = await queryD1(config, databaseId, "SELECT name FROM aura_schema_migrations ORDER BY name;");
  const applied = new Set();
  for (const part of result) {
    for (const row of Array.isArray(part?.results) ? part.results : []) {
      if (typeof row?.name === "string") applied.add(row.name);
    }
  }
  return applied;
}

async function assertPhase4UnappliedState(config, databaseId, fileName) {
  if (fileName !== PHASE4_MIGRATION) return;

  const columns = new Set(
    rowsFrom(await queryD1(config, databaseId, "PRAGMA table_info(boards);"))
      .map((row) => row?.name)
      .filter((name) => typeof name === "string"),
  );
  const quoted = PHASE4_OBJECT_NAMES.map((name) => sqlString(name)).join(", ");
  const objects = new Set(
    rowsFrom(await queryD1(
      config,
      databaseId,
      `SELECT name FROM sqlite_schema WHERE name IN (${quoted});`,
    ))
      .map((row) => row?.name)
      .filter((name) => typeof name === "string"),
  );

  const present = [];
  if (columns.has("status")) present.push("column:boards.status");
  if (columns.has("sort_order")) present.push("column:boards.sort_order");
  for (const name of PHASE4_OBJECT_NAMES) {
    if (objects.has(name)) present.push(name);
  }
  if (present.length) {
    fail(`Refusing to apply ${fileName}: unrecorded Phase 4 schema state already exists (${present.join(", ")}). Run npm run inspect and repair deliberately.`);
  }
}

async function loadMigration(fileName) {
  const sql = await readFile(resolve(MIGRATIONS_DIR, fileName), "utf8");
  return splitMigrationSql(sql, fileName);
}

async function checkMigrations() {
  const migrationFiles = await listMigrationFiles();
  if (!migrationFiles.length) fail("No numbered SQL migrations were found.");
  console.log("Aura migration parser check");
  for (const fileName of migrationFiles) {
    const statements = await loadMigration(fileName);
    const triggers = statements.filter((sql) => /^CREATE\s+TRIGGER\b/i.test(sql)).length;
    console.log(`  ${fileName}: ${statements.length} statements${triggers ? ` (${triggers} triggers)` : ""}`);
  }
  console.log("Migration parser check passed.");
}

async function applyMigrations() {
  const config = loadConfig();
  const migrationFiles = await listMigrationFiles();
  if (!migrationFiles.length) fail("No numbered SQL migrations were found.");

  console.log(`Using Cloudflare account ${config.accountId}.`);
  const database = await findOrCreateD1(config);
  console.log(`${database.created ? "Created" : "Using"} D1 database ${config.d1Name} (${database.id}).`);
  const applied = await readAppliedMigrations(config, database.id);

  const newlyApplied = [];
  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) continue;
    await assertPhase4UnappliedState(config, database.id, fileName);
    const statements = await loadMigration(fileName);
    const marker = `INSERT INTO aura_schema_migrations(name, applied_at) VALUES (${sqlString(fileName)}, unixepoch());`;
    await batchD1(config, database.id, [...statements, marker]);
    newlyApplied.push(fileName);
    applied.add(fileName);
  }

  console.log(newlyApplied.length ? `Applied migrations transactionally: ${newlyApplied.join(", ")}.` : "No new migrations to apply.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--check") {
    await checkMigrations();
    return;
  }
  if (args.length !== 0) fail("Usage: node migrate.mjs [--check]");
  await applyMigrations();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Aura migration failed: ${message}`);
  process.exitCode = 1;
});
