#!/usr/bin/env node

import {
  createHumanInviteToken,
  normalizeInviteEmail,
} from "../../packages/core/src/auth/invites.ts";

const API_BASE = "https://api.cloudflare.com/client/v4";
const DEFAULT_TTL_SECONDS = 60 * 60;

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function config() {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const email = normalizeInviteEmail(requireEnv("AURA_BOOTSTRAP_EMAIL"));
  const webOrigin = requireEnv("AURA_WEB_ORIGIN").replace(/\/+$/u, "");
  const d1Name = process.env.AURA_D1_NAME?.trim() || "aura";
  if (!/^[0-9a-f]{32}$/.test(accountId)) fail("CLOUDFLARE_ACCOUNT_ID is invalid.");
  if (email === null) fail("AURA_BOOTSTRAP_EMAIL is invalid.");
  let parsedOrigin;
  try {
    parsedOrigin = new URL(webOrigin);
  } catch {
    fail("AURA_WEB_ORIGIN must be an absolute HTTPS origin.");
  }
  if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== webOrigin || parsedOrigin.pathname !== "/") {
    fail("AURA_WEB_ORIGIN must be an HTTPS origin with no path, query, or fragment.");
  }
  return { accountId, apiToken, email, webOrigin, d1Name };
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
      fail(`Cloudflare returned non-JSON data (HTTP ${response.status}).`);
    }
  }
  if (!response.ok || payload?.success === false) {
    const detail = (Array.isArray(payload?.errors) ? payload.errors : [])
      .map((entry) => typeof entry?.message === "string" ? entry.message : null)
      .filter(Boolean)
      .slice(0, 5)
      .join("; ");
    fail(`Cloudflare API rejected the request (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
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

async function query(cfg, databaseId, sql, params = []) {
  const payload = await cfJson(
    cfg,
    `/accounts/${cfg.accountId}/d1/database/${databaseId}/query`,
    "POST",
    { sql, params },
  );
  const parts = Array.isArray(payload?.result) ? payload.result : [];
  if (parts.some((part) => part?.success === false)) fail("D1 rejected the bootstrap query.");
  const rows = [];
  for (const part of parts) if (Array.isArray(part?.results)) rows.push(...part.results);
  return rows;
}

async function main() {
  if (process.argv.length !== 2) fail("Usage: node tools/pilot/bootstrap-admin.mjs");
  const cfg = config();
  const databaseId = await findD1(cfg);

  const humanRows = await query(cfg, databaseId, "SELECT count(*) AS n FROM humans;");
  if (Number(humanRows[0]?.n) !== 0) {
    fail("Bootstrap admin creation is permanently unavailable because a human account already exists.");
  }

  const pending = await query(
    cfg,
    databaseId,
    "SELECT invite_id, email, expires_at FROM human_invites WHERE kind='bootstrap_admin' AND status='pending' LIMIT 1;",
  );
  if (pending.length !== 0) {
    fail(`A pending bootstrap-admin invitation already exists for ${String(pending[0]?.email ?? "unknown email")}. Its plaintext secret cannot be recovered; revoke/replace it deliberately if it was lost.`);
  }

  const created = await createHumanInviteToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + DEFAULT_TTL_SECONDS;

  await query(
    cfg,
    databaseId,
    `INSERT INTO human_invites
      (invite_id, secret_verifier, email, kind, initial_role, status, created_at, expires_at)
     VALUES (?1, ?2, ?3, 'bootstrap_admin', 'admin', 'pending', ?4, ?5);`,
    [created.inviteId, created.verifier, cfg.email, now, expiresAt],
  );

  console.log("Aura bootstrap-admin invitation created.");
  console.log(`  Email:   ${cfg.email}`);
  console.log(`  Expires: ${new Date(expiresAt * 1000).toISOString()}`);
  console.log("  Invite URL (SECRET — shown once):");
  console.log(`  ${cfg.webOrigin}/invite/${created.token}`);
}

main().catch((error) => {
  console.error(`Aura bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
