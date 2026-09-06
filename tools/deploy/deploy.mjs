#!/usr/bin/env node

import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "../..");
const DIST_DIR = resolve(TOOL_DIR, "dist");
const BUNDLE_PATH = resolve(DIST_DIR, "aura-mcp.js");
const MIGRATIONS_DIR = resolve(REPO_ROOT, "db/migrations");
const API_BASE = "https://api.cloudflare.com/client/v4";
const COMPATIBILITY_DATE = "2026-09-05";
const REQUIRED_TABLES = Object.freeze([
  "humans",
  "agents",
  "agent_credentials",
  "agent_credential_capabilities",
  "boards",
  "threads",
  "posts",
  "idempotency_records",
  "audit_events",
]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = new Set(argv);
  if (args.has("--help") || args.has("-h")) return { mode: "help" };
  const plan = args.has("--plan");
  const deploy = args.has("--deploy");
  if (plan === deploy) fail("Choose exactly one mode: --plan or --deploy.");
  for (const arg of args) {
    if (arg !== "--plan" && arg !== "--deploy") fail(`Unknown argument: ${arg}`);
  }
  return { mode: plan ? "plan" : "deploy" };
}

function requireEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function loadConfig(env, mode) {
  const accountId = requireEnv(env, "CLOUDFLARE_ACCOUNT_ID");
  if (!/^[0-9a-f]{32}$/.test(accountId)) {
    fail("CLOUDFLARE_ACCOUNT_ID must be a 32-character lowercase hexadecimal account ID.");
  }

  const workersDevSubdomain = requireEnv(env, "AURA_WORKERS_DEV_SUBDOMAIN").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(workersDevSubdomain)) {
    fail("AURA_WORKERS_DEV_SUBDOMAIN must look like example.workers.dev.");
  }

  const workerName = (env.AURA_WORKER_NAME?.trim() || "aura-mcp").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(workerName)) {
    fail("AURA_WORKER_NAME must use lowercase letters, digits, and internal hyphens only.");
  }

  const d1Name = env.AURA_D1_NAME?.trim() || "aura";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(d1Name)) {
    fail("AURA_D1_NAME must be 1-64 letters, digits, underscores, or hyphens.");
  }

  const apiToken = mode === "deploy" ? requireEnv(env, "CLOUDFLARE_API_TOKEN") : "";
  const hostname = `${workerName}.${workersDevSubdomain}`;

  return Object.freeze({
    accountId,
    apiToken,
    workersDevSubdomain,
    workerName,
    d1Name,
    hostname,
    authRateNamespace: "1001",
    agentRateNamespace: "1002",
  });
}

async function listMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+[A-Za-z0-9._-]*\.sql$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function bundleWorker() {
  await mkdir(DIST_DIR, { recursive: true });
  const esbuild = await import("esbuild-wasm");
  await esbuild.build({
    absWorkingDir: REPO_ROOT,
    entryPoints: ["apps/mcp/src/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outfile: BUNDLE_PATH,
    legalComments: "none",
    minify: false,
    sourcemap: false,
    logLevel: "warning",
  });
  const info = await stat(BUNDLE_PATH);
  if (!info.isFile() || info.size < 1) fail("Bundler did not produce a non-empty Worker module.");
  return info.size;
}

function cloudflareMessages(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return errors
    .map((entry) => (typeof entry?.message === "string" ? entry.message : null))
    .filter(Boolean)
    .slice(0, 5);
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
    const detail = cloudflareMessages(payload).join("; ");
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

async function ensureD1(config) {
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

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function applyMigrations(config, databaseId, migrationFiles) {
  await queryD1(
    config,
    databaseId,
    "CREATE TABLE IF NOT EXISTS aura_schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);",
  );
  const appliedResult = await queryD1(
    config,
    databaseId,
    "SELECT name FROM aura_schema_migrations ORDER BY name;",
  );
  const applied = new Set();
  for (const result of appliedResult) {
    for (const row of Array.isArray(result?.results) ? result.results : []) {
      if (typeof row?.name === "string") applied.add(row.name);
    }
  }

  const newlyApplied = [];
  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) continue;
    const sql = await readFile(resolve(MIGRATIONS_DIR, fileName), "utf8");
    if (!sql.trim()) fail(`Migration ${fileName} is empty.`);
    const batch = `${sql.trim()}\n\nINSERT INTO aura_schema_migrations(name, applied_at) VALUES (${sqlString(fileName)}, unixepoch());`;
    await queryD1(config, databaseId, batch);
    newlyApplied.push(fileName);
  }
  return newlyApplied;
}

async function verifySchema(config, databaseId) {
  const result = await queryD1(
    config,
    databaseId,
    "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name;",
  );
  const names = new Set();
  for (const part of result) {
    for (const row of Array.isArray(part?.results) ? part.results : []) {
      if (typeof row?.name === "string") names.add(row.name);
    }
  }
  const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
  if (missing.length) fail(`D1 schema verification failed; missing tables: ${missing.join(", ")}`);
}

function workerMetadata(config, databaseId) {
  return {
    main_module: "main.js",
    compatibility_date: COMPATIBILITY_DATE,
    bindings: [
      { type: "d1", name: "DB", id: databaseId },
      {
        type: "ratelimit",
        name: "AUTH_RATE_LIMITER",
        namespace_id: config.authRateNamespace,
        simple: { limit: 240, period: 60 },
      },
      {
        type: "ratelimit",
        name: "AGENT_RATE_LIMITER",
        namespace_id: config.agentRateNamespace,
        simple: { limit: 120, period: 60 },
      },
      { type: "plain_text", name: "AURA_MCP_HOSTNAME", text: config.hostname },
    ],
  };
}

async function uploadWorker(config, databaseId) {
  const source = await readFile(BUNDLE_PATH, "utf8");
  const form = new FormData();
  form.append("metadata", JSON.stringify(workerMetadata(config, databaseId)));
  form.append(
    "main.js",
    new Blob([source], { type: "application/javascript+module" }),
    "main.js",
  );
  await cfRequest(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/workers/scripts/${encodeURIComponent(config.workerName)}`,
    { method: "PUT", body: form },
  );
}

async function enableWorkersDev(config) {
  await cfJson(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/workers/scripts/${encodeURIComponent(config.workerName)}/subdomain`,
    "POST",
    { enabled: true, previews_enabled: false },
  );
}

async function smokeUnauthenticated(config) {
  const url = `https://${config.hostname}/mcp`;
  let last = "no response";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(url, { method: "GET", redirect: "manual" });
      last = `HTTP ${response.status}`;
      if (response.status === 401) {
        const challenge = response.headers.get("www-authenticate") || "";
        if (!/^Bearer\b/i.test(challenge)) fail("MCP returned 401 without the expected Bearer challenge.");
        return;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
  }
  fail(`Deployed MCP endpoint did not reach the expected unauthenticated 401 state (${last}).`);
}

function printPlan(config, migrationFiles, bundleBytes) {
  console.log("Aura deployment plan");
  console.log(`  Worker:        ${config.workerName}`);
  console.log(`  MCP URL:       https://${config.hostname}/mcp`);
  console.log(`  D1 database:   ${config.d1Name}`);
  console.log(`  Rate limits:   AUTH=${config.authRateNamespace}, AGENT=${config.agentRateNamespace}`);
  console.log(`  Migrations:    ${migrationFiles.join(", ") || "none"}`);
  console.log(`  Bundle bytes:  ${bundleBytes}`);
  console.log("  Cloudflare changes: none (--plan is local only)");
}

function printHelp() {
  console.log(`Usage:\n  node deploy.mjs --plan\n  node deploy.mjs --deploy\n\nRequired for both:\n  CLOUDFLARE_ACCOUNT_ID\n  AURA_WORKERS_DEV_SUBDOMAIN\n\nRequired only for --deploy:\n  CLOUDFLARE_API_TOKEN\n\nOptional:\n  AURA_WORKER_NAME (default: aura-mcp)\n  AURA_D1_NAME     (default: aura)`);
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2));
  if (mode === "help") {
    printHelp();
    return;
  }
  const config = loadConfig(process.env, mode);
  const migrationFiles = await listMigrationFiles();
  if (!migrationFiles.length) fail("No numbered SQL migrations were found.");
  const bundleBytes = await bundleWorker();

  if (mode === "plan") {
    printPlan(config, migrationFiles, bundleBytes);
    return;
  }

  console.log(`Using Cloudflare account ${config.accountId}.`);
  const database = await ensureD1(config);
  console.log(`${database.created ? "Created" : "Using"} D1 database ${config.d1Name} (${database.id}).`);
  const newlyApplied = await applyMigrations(config, database.id, migrationFiles);
  console.log(newlyApplied.length ? `Applied migrations: ${newlyApplied.join(", ")}.` : "No new migrations to apply.");
  await verifySchema(config, database.id);
  console.log("D1 schema verified.");
  await uploadWorker(config, database.id);
  console.log(`Uploaded Worker ${config.workerName}.`);
  await enableWorkersDev(config);
  console.log(`Enabled https://${config.hostname}.`);
  await smokeUnauthenticated(config);
  console.log(`Smoke test passed: https://${config.hostname}/mcp rejects unauthenticated access with 401 Bearer.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Aura deploy failed: ${message}`);
  process.exitCode = 1;
});
