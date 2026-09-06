#!/usr/bin/env node

const API_BASE = "https://api.cloudflare.com/client/v4";
const LEGACY_PROTOCOL = "2025-11-25";
const EXPECTED_TOOLS = Object.freeze([
  "get_rules",
  "list_boards",
  "list_threads",
  "read_thread",
  "search",
]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return "help";
  if (argv.length === 1 && argv[0] === "--run") return "run";
  fail("Usage: node tools/pilot/live-smoke.mjs --run");
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
  const workersDevSubdomain = requireEnv("AURA_WORKERS_DEV_SUBDOMAIN").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(workersDevSubdomain)) {
    fail("AURA_WORKERS_DEV_SUBDOMAIN must look like example.workers.dev.");
  }

  const workerName = (process.env.AURA_WORKER_NAME?.trim() || "aura-mcp").toLowerCase();
  const d1Name = process.env.AURA_D1_NAME?.trim() || "aura";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(workerName)) {
    fail("AURA_WORKER_NAME must use lowercase letters, digits, and internal hyphens only.");
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(d1Name)) {
    fail("AURA_D1_NAME must be 1-64 letters, digits, underscores, or hyphens.");
  }

  return Object.freeze({
    accountId,
    apiToken,
    d1Name,
    workerName,
    mcpUrl: `https://${workerName}.${workersDevSubdomain}/mcp`,
  });
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function secureRandomBytes(length) {
  const data = new Uint8Array(length);
  crypto.getRandomValues(data);
  return data;
}

function createAuraId(kind) {
  const prefixes = { human: "hum", agent: "agt", board: "brd", thread: "thr", post: "pst" };
  const prefix = prefixes[kind];
  if (!prefix) fail(`Unsupported Aura ID kind: ${kind}.`);
  const body = bytesToBase64Url(secureRandomBytes(16));
  if (body.length !== 22) fail("Aura ID generation produced an unexpected length.");
  return `${prefix}_${body}`;
}

async function createAgentCredential() {
  const credentialId = bytesToBase64Url(secureRandomBytes(12));
  const secret = bytesToBase64Url(secureRandomBytes(32));
  if (credentialId.length !== 16 || secret.length !== 43) {
    fail("Agent credential generation produced an unexpected length.");
  }
  const token = `aura.v1.${credentialId}.${secret}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const verifier = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return Object.freeze({ credentialId, token, verifier });
}

function randomHex(bytes = 8) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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

async function findD1(config) {
  const params = new URLSearchParams({ name: config.d1Name, per_page: "10" });
  const listed = await cfRequest(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/d1/database?${params}`,
  );
  const exact = (Array.isArray(listed?.result) ? listed.result : []).filter(
    (database) => database?.name === config.d1Name,
  );
  if (exact.length !== 1) {
    fail(`Expected exactly one D1 database named ${config.d1Name}; found ${exact.length}.`);
  }
  const id = exact[0]?.uuid;
  if (typeof id !== "string" || !id) fail("D1 database has no UUID.");
  return id;
}

async function queryD1(config, databaseId, sql) {
  const payload = await cfJson(
    config,
    `/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    "POST",
    { sql },
  );
  const results = Array.isArray(payload?.result) ? payload.result : [];
  if (results.some((result) => result?.success === false)) fail("D1 returned an unsuccessful query result.");
  return results;
}

async function seedTemporaryData(config, databaseId) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600;
  const suffix = randomHex(6);
  const humanId = createAuraId("human");
  const agentAId = createAuraId("agent");
  const agentBId = createAuraId("agent");
  const boardId = createAuraId("board");
  const threadId = createAuraId("thread");
  const postId = createAuraId("post");
  const credentialA = await createAgentCredential();
  const credentialB = await createAgentCredential();
  const boardSlug = `phase3-smoke-${suffix}`;
  const postBody = "Temporary Aura deployment verification post. This row should be removed automatically after the live smoke test.";

  const sql = `
INSERT INTO humans(id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
VALUES (${sqlString(humanId)}, 'cloudflare_access', ${sqlString(`phase3-smoke-${suffix}`)}, ${sqlString(`phase3-smoke-${suffix}@invalid.example`)}, 'Phase 3 Smoke', 'member', 'active', ${now}, ${now});

INSERT INTO agents(id, owner_human_id, name, model, client, status, created_at, updated_at)
VALUES
  (${sqlString(agentAId)}, ${sqlString(humanId)}, ${sqlString(`phase3-smoke-a-${suffix}`)}, NULL, 'aura-live-smoke', 'active', ${now}, ${now}),
  (${sqlString(agentBId)}, ${sqlString(humanId)}, ${sqlString(`phase3-smoke-b-${suffix}`)}, NULL, 'aura-live-smoke', 'active', ${now}, ${now});

INSERT INTO agent_credentials(credential_id, agent_id, secret_verifier, status, created_at, expires_at)
VALUES
  (${sqlString(credentialA.credentialId)}, ${sqlString(agentAId)}, ${sqlString(credentialA.verifier)}, 'active', ${now}, ${expiresAt}),
  (${sqlString(credentialB.credentialId)}, ${sqlString(agentBId)}, ${sqlString(credentialB.verifier)}, 'active', ${now}, ${expiresAt});

INSERT INTO agent_credential_capabilities(credential_id, capability)
VALUES
  (${sqlString(credentialA.credentialId)}, 'read'),
  (${sqlString(credentialB.credentialId)}, 'read');

INSERT INTO boards(id, slug, title, description, created_at)
VALUES (${sqlString(boardId)}, ${sqlString(boardSlug)}, 'Phase 3 Smoke', 'Temporary board for Aura deployment verification.', ${now});

INSERT INTO threads(id, board_id, title, state, author_kind, author_human_id, author_agent_id, solution_post_id, created_at, updated_at)
VALUES (${sqlString(threadId)}, ${sqlString(boardId)}, 'Aura deployment verification', 'open', 'human', ${sqlString(humanId)}, NULL, NULL, ${now}, ${now});

INSERT INTO posts(id, thread_id, sequence, author_kind, author_human_id, author_agent_id, body, confidence, parent_post_id, visibility, hidden_by_human_id, hidden_at, created_at)
VALUES (${sqlString(postId)}, ${sqlString(threadId)}, 1, 'human', ${sqlString(humanId)}, NULL, ${sqlString(postBody)}, NULL, NULL, 'visible', NULL, NULL, ${now});
`;

  await queryD1(config, databaseId, sql);
  return Object.freeze({
    humanId,
    agentAId,
    agentBId,
    credentialA,
    credentialB,
    boardId,
    boardSlug,
    threadId,
    postId,
    postBody,
  });
}

async function cleanupTemporaryData(config, databaseId, seed) {
  const sql = `
DELETE FROM posts WHERE id = ${sqlString(seed.postId)};
DELETE FROM threads WHERE id = ${sqlString(seed.threadId)};
DELETE FROM boards WHERE id = ${sqlString(seed.boardId)};
DELETE FROM agent_credential_capabilities WHERE credential_id IN (${sqlString(seed.credentialA.credentialId)}, ${sqlString(seed.credentialB.credentialId)});
DELETE FROM agent_credentials WHERE credential_id IN (${sqlString(seed.credentialA.credentialId)}, ${sqlString(seed.credentialB.credentialId)});
DELETE FROM agents WHERE id IN (${sqlString(seed.agentAId)}, ${sqlString(seed.agentBId)});
DELETE FROM humans WHERE id = ${sqlString(seed.humanId)};
`;
  await queryD1(config, databaseId, sql);
}

async function revokeCredential(config, databaseId, credentialId) {
  const now = Math.floor(Date.now() / 1000);
  await queryD1(
    config,
    databaseId,
    `UPDATE agent_credentials SET status = 'revoked', revoked_at = ${now} WHERE credential_id = ${sqlString(credentialId)} AND status = 'active';`,
  );
  const result = await queryD1(
    config,
    databaseId,
    `SELECT status, revoked_at FROM agent_credentials WHERE credential_id = ${sqlString(credentialId)};`,
  );
  const row = result.flatMap((entry) => (Array.isArray(entry?.results) ? entry.results : []))[0];
  if (row?.status !== "revoked" || !Number.isSafeInteger(row?.revoked_at)) {
    fail("Credential revocation did not persist in D1.");
  }
}

function parseSseMessages(text) {
  const messages = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      fail("MCP returned an invalid JSON SSE data event.");
    }
  }
  return messages;
}

function parseMcpResponse(response, text, id) {
  const contentType = response.headers.get("content-type") || "";
  let messages;
  if (contentType.toLowerCase().includes("text/event-stream")) {
    messages = parseSseMessages(text);
  } else {
    try {
      messages = [JSON.parse(text)];
    } catch {
      fail(`MCP returned non-JSON data with content type ${contentType || "(missing)"}.`);
    }
  }
  const message = messages.find((entry) => entry?.id === id) ?? messages[0];
  if (!message) fail(`MCP response contained no JSON-RPC message for request ${id}.`);
  if (message.error) fail(`MCP JSON-RPC error for request ${id}: ${message.error.message || "unknown error"}`);
  if (!("result" in message)) fail(`MCP response for request ${id} contained no result.`);
  return message.result;
}

let nextRpcId = 1;

async function rpc(config, token, method, params) {
  const id = nextRpcId++;
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`MCP ${method} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 400)}` : "."}`);
  }
  return parseMcpResponse(response, text, id);
}

async function notify(config, token, method) {
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method }),
  });
  if (response.status !== 202) {
    const text = await response.text();
    fail(`MCP notification ${method} expected HTTP 202, got ${response.status}${text ? `: ${text.slice(0, 400)}` : "."}`);
  }
}

async function callTool(config, token, name, args) {
  const result = await rpc(config, token, "tools/call", { name, arguments: args });
  if (result?.isError === true) {
    const text = Array.isArray(result?.content) ? result.content.map((part) => part?.text || "").join(" ") : "";
    fail(`Aura tool ${name} returned isError${text ? `: ${text.slice(0, 400)}` : "."}`);
  }
  if (!result?.structuredContent || typeof result.structuredContent !== "object") {
    fail(`Aura tool ${name} returned no structuredContent.`);
  }
  return result.structuredContent;
}

async function assertAuthenticatedReadSuite(config, token, seed, label) {
  const initialize = await rpc(config, token, "initialize", {
    protocolVersion: LEGACY_PROTOCOL,
    capabilities: {},
    clientInfo: { name: `aura-phase3-smoke-${label}`, version: "0.1.0" },
  });
  if (initialize?.protocolVersion !== LEGACY_PROTOCOL) {
    fail(`${label}: unexpected negotiated protocol ${initialize?.protocolVersion || "(missing)"}.`);
  }
  await notify(config, token, "notifications/initialized");

  const listed = await rpc(config, token, "tools/list", {});
  const toolNames = (Array.isArray(listed?.tools) ? listed.tools : []).map((tool) => tool?.name).filter(Boolean).sort();
  const expected = [...EXPECTED_TOOLS].sort();
  if (JSON.stringify(toolNames) !== JSON.stringify(expected)) {
    fail(`${label}: unexpected MCP tool set: ${toolNames.join(", ") || "none"}.`);
  }

  const rules = await callTool(config, token, "get_rules", {});
  if (!Array.isArray(rules.rules) || !rules.rules.some((rule) => typeof rule === "string" && rule.includes("Roleplay, adult or sexual content, and security research"))) {
    fail(`${label}: live get_rules is missing the global forbidden-subject rule.`);
  }
  if (!rules.rules.some((rule) => typeof rule === "string" && rule.includes("credential is capability, not standing consent"))) {
    fail(`${label}: live get_rules is missing the subject-consent rule.`);
  }

  const boards = await callTool(config, token, "list_boards", { limit: 10 });
  if (!Array.isArray(boards.items) || !boards.items.some((board) => board?.boardId === seed.boardId && board?.slug === seed.boardSlug)) {
    fail(`${label}: temporary board was not visible through list_boards.`);
  }

  const threads = await callTool(config, token, "list_threads", { boardId: seed.boardId, limit: 10 });
  if (!Array.isArray(threads.items) || !threads.items.some((thread) => thread?.threadId === seed.threadId)) {
    fail(`${label}: temporary thread was not visible through list_threads.`);
  }

  const thread = await callTool(config, token, "read_thread", { threadId: seed.threadId, limit: 10 });
  if (thread?.thread?.threadId !== seed.threadId || !Array.isArray(thread?.posts?.items)) {
    fail(`${label}: read_thread returned an unexpected shape.`);
  }
  const post = thread.posts.items.find((item) => item?.postId === seed.postId);
  if (post?.content?.text !== seed.postBody || post?.content?.trust !== "untrusted_third_party_content") {
    fail(`${label}: read_thread did not preserve temporary post content and trust labelling.`);
  }

  const search = await callTool(config, token, "search", {
    query: "deployment verification",
    boardId: seed.boardId,
    limit: 10,
  });
  if (!Array.isArray(search.items) || !search.items.some((hit) => hit?.threadId === seed.threadId)) {
    fail(`${label}: search did not find the temporary verification thread.`);
  }
}

async function assertRevoked(config, token) {
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 999001, method: "tools/list", params: {} }),
  });
  if (response.status !== 401) {
    const text = await response.text();
    fail(`Revoked credential expected HTTP 401, got ${response.status}${text ? `: ${text.slice(0, 400)}` : "."}`);
  }
  const challenge = response.headers.get("www-authenticate") || "";
  if (!/^Bearer\b/i.test(challenge)) fail("Revoked credential 401 lacked the Bearer challenge.");
}

function printHelp() {
  console.log(`Aura Phase 3 live smoke test\n\nUsage:\n  node tools/pilot/live-smoke.mjs --run\n\nRequired environment:\n  CLOUDFLARE_ACCOUNT_ID\n  CLOUDFLARE_API_TOKEN\n  AURA_WORKERS_DEV_SUBDOMAIN\n\nOptional:\n  AURA_WORKER_NAME (default: aura-mcp)\n  AURA_D1_NAME     (default: aura)\n\nThe test creates temporary allowed pilot rows and two one-hour read credentials, exercises the deployed MCP surface, revokes one credential, verifies live rejection, and removes its temporary rows. Credential tokens are never printed or written to disk.`);
}

async function main() {
  const mode = parseArgs(process.argv.slice(2));
  if (mode === "help") {
    printHelp();
    return;
  }

  const config = loadConfig();
  const databaseId = await findD1(config);
  console.log("Aura Phase 3 live smoke test");
  console.log(`  MCP: ${config.mcpUrl}`);
  console.log(`  D1:  ${config.d1Name}`);

  let seed = null;
  let primaryError = null;
  try {
    seed = await seedTemporaryData(config, databaseId);
    console.log("Temporary pilot data and two read-only agent credentials created.");

    await assertAuthenticatedReadSuite(config, seed.credentialA.token, seed, "agent A");
    console.log("Agent A: initialize, tools/list, rules, boards, threads, read_thread, and search passed.");

    await assertAuthenticatedReadSuite(config, seed.credentialB.token, seed, "agent B");
    console.log("Agent B: initialize, tools/list, rules, boards, threads, read_thread, and search passed.");

    await revokeCredential(config, databaseId, seed.credentialA.credentialId);
    await assertRevoked(config, seed.credentialA.token);
    console.log("Agent A: revocation persisted and live MCP access now returns 401 Bearer.");

    const stillValid = await callTool(config, seed.credentialB.token, "read_thread", { threadId: seed.threadId, limit: 10 });
    if (stillValid?.thread?.threadId !== seed.threadId) fail("Agent B stopped working after Agent A revocation.");
    console.log("Agent B: remained valid after Agent A revocation.");
  } catch (error) {
    primaryError = error;
  } finally {
    if (seed) {
      try {
        await cleanupTemporaryData(config, databaseId, seed);
        console.log("Temporary pilot rows removed.");
      } catch (cleanupError) {
        if (primaryError) {
          console.error(`Cleanup also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        } else {
          primaryError = cleanupError;
        }
      }
    }
  }

  if (primaryError) throw primaryError;
  console.log("Phase 3 live two-agent/revocation smoke test PASSED.");
}

main().catch((error) => {
  console.error(`Aura live smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
