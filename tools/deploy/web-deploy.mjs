#!/usr/bin/env node

import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "../..");
const DIST_DIR = resolve(TOOL_DIR, "dist");
const BUNDLE_PATH = resolve(DIST_DIR, "aura-web.js");
const API_BASE = "https://api.cloudflare.com/client/v4";
const COMPATIBILITY_DATE = "2026-09-06";

function fail(message) {
  throw new Error(message);
}

function parseMode() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--plan", "--deploy"].includes(args[0])) {
    fail("Usage: node web-deploy.mjs --plan|--deploy");
  }
  return args[0] === "--plan" ? "plan" : "deploy";
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function loadConfig(mode) {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const workersDevSubdomain = requireEnv("AURA_WORKERS_DEV_SUBDOMAIN").toLowerCase();
  const apiToken = mode === "deploy" ? requireEnv("CLOUDFLARE_API_TOKEN") : "";
  const d1Name = process.env.AURA_D1_NAME?.trim() || "aura";
  const workerName = process.env.AURA_WEB_WORKER_NAME?.trim().toLowerCase() || "aura-web";
  const audience = process.env.AURA_ACCESS_AUD?.trim() || "";
  const csrfKeyHex = process.env.AURA_CSRF_KEY_HEX?.trim() || "";

  if (!/^[0-9a-f]{32}$/.test(accountId)) fail("CLOUDFLARE_ACCOUNT_ID is invalid.");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(workersDevSubdomain)) {
    fail("AURA_WORKERS_DEV_SUBDOMAIN must look like example.workers.dev.");
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(d1Name)) fail("AURA_D1_NAME is invalid.");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(workerName)) fail("AURA_WEB_WORKER_NAME is invalid.");

  const hasAudience = audience.length > 0;
  const hasCsrf = csrfKeyHex.length > 0;
  if (hasAudience !== hasCsrf) fail("AURA_ACCESS_AUD and AURA_CSRF_KEY_HEX must either both be set or both be absent.");
  if (hasCsrf && !/^[0-9a-f]{64}$/.test(csrfKeyHex)) fail("AURA_CSRF_KEY_HEX must be 64 lowercase hexadecimal characters.");
  if (hasAudience && audience.length > 512) fail("AURA_ACCESS_AUD is too long.");

  return Object.freeze({
    accountId,
    workersDevSubdomain,
    apiToken,
    d1Name,
    workerName,
    audience,
    csrfKeyHex,
    configured: hasAudience,
    hostname: `${workerName}.${workersDevSubdomain}`,
  });
}

async function bundleWorker() {
  await mkdir(DIST_DIR, { recursive: true });
  const esbuild = await import("esbuild-wasm");
  await esbuild.build({
    absWorkingDir: REPO_ROOT,
    entryPoints: ["apps/web/src/index.ts"],
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
  if (!info.isFile() || info.size < 1) fail("Bundler did not produce aura-web.js.");
  return info.size;
}

async function cfRequest(cfg, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${cfg.apiToken}`);
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
    const detail = (Array.isArray(payload?.errors) ? payload.errors : [])
      .map((entry) => typeof entry?.message === "string" ? entry.message : null)
      .filter(Boolean)
      .slice(0, 5)
      .join("; ");
    fail(`Cloudflare API rejected ${options.method || "GET"} ${path} (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return payload;
}

async function cfJson(cfg, path, method, body) {
  return cfRequest(cfg, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function findD1(cfg) {
  const params = new URLSearchParams({ name: cfg.d1Name, per_page: "10" });
  const payload = await cfRequest(cfg, `/accounts/${cfg.accountId}/d1/database?${params}`);
  const exact = (Array.isArray(payload?.result) ? payload.result : []).filter((db) => db?.name === cfg.d1Name);
  if (exact.length !== 1 || typeof exact[0]?.uuid !== "string") {
    fail(`Expected exactly one D1 database named ${cfg.d1Name}.`);
  }
  return exact[0].uuid;
}

function metadata(cfg, databaseId) {
  const bindings = [{ type: "d1", name: "DB", id: databaseId }];
  if (cfg.configured) {
    bindings.push({ type: "plain_text", name: "AURA_ACCESS_AUD", text: cfg.audience });
    bindings.push({ type: "secret_text", name: "AURA_CSRF_KEY_HEX", text: cfg.csrfKeyHex });
  }
  return {
    main_module: "main.js",
    compatibility_date: COMPATIBILITY_DATE,
    bindings,
  };
}

async function upload(cfg, databaseId) {
  const source = await readFile(BUNDLE_PATH, "utf8");
  const form = new FormData();
  form.append("metadata", JSON.stringify(metadata(cfg, databaseId)));
  form.append("main.js", new Blob([source], { type: "application/javascript+module" }), "main.js");
  await cfRequest(
    cfg,
    `/accounts/${cfg.accountId}/workers/scripts/${encodeURIComponent(cfg.workerName)}`,
    { method: "PUT", body: form },
  );
}

async function enableWorkersDev(cfg) {
  await cfJson(
    cfg,
    `/accounts/${cfg.accountId}/workers/scripts/${encodeURIComponent(cfg.workerName)}/subdomain`,
    "POST",
    { enabled: true, previews_enabled: false },
  );
}

async function smokeStaged(cfg) {
  const response = await fetch(`https://${cfg.hostname}/`, { redirect: "manual" });
  if (response.status !== 503) {
    fail(`Staged aura-web expected HTTP 503 before Access runtime configuration, got ${response.status}.`);
  }
}

async function main() {
  const mode = parseMode();
  const cfg = loadConfig(mode);
  const bundleBytes = await bundleWorker();

  console.log("Aura web deployment plan");
  console.log(`  Worker:       ${cfg.workerName}`);
  console.log(`  URL:          https://${cfg.hostname}/`);
  console.log(`  D1 database:  ${cfg.d1Name}`);
  console.log(`  Bundle bytes: ${bundleBytes}`);
  console.log(`  Runtime auth: ${cfg.configured ? "Access AUD + CSRF secret supplied" : "staged / setup-incomplete"}`);

  if (mode === "plan") {
    console.log("  Cloudflare changes: none (--plan is local only)");
    return;
  }

  const databaseId = await findD1(cfg);
  await upload(cfg, databaseId);
  console.log(`Uploaded Worker ${cfg.workerName}.`);
  await enableWorkersDev(cfg);
  console.log(`Enabled https://${cfg.hostname}.`);

  if (!cfg.configured) {
    await smokeStaged(cfg);
    console.log("Staged smoke passed: unconfigured human routes fail closed with HTTP 503.");
  } else {
    console.log("Runtime credentials supplied. Cloudflare Access protection must be verified separately after the Access policy is attached.");
  }
}

main().catch((error) => {
  console.error(`Aura web deploy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
