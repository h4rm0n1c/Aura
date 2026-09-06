#!/usr/bin/env node

const PROTOCOL_VERSION = "2025-11-25";
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
  if (argv.length === 1 && argv[0] === "--active") return "active";
  if (argv.length === 1 && argv[0] === "--rejected") return "rejected";
  fail("Usage: node tools/pilot/verify-agent.mjs --active|--rejected");
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function loadConfig() {
  const token = requireEnv("AURA_AGENT_TOKEN");
  if (!/^aura\.v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    fail("AURA_AGENT_TOKEN is not a valid Aura v1 credential shape.");
  }

  const rawUrl = requireEnv("AURA_MCP_URL");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail("AURA_MCP_URL must be an absolute HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/mcp") {
    fail("AURA_MCP_URL must be an HTTPS /mcp URL with no credentials, query, or fragment.");
  }

  return Object.freeze({ token, mcpUrl: url.href });
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

async function rpc(config, method, params) {
  const id = nextRpcId++;
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  if (!response.ok) {
    fail(`MCP ${method} failed with HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : "."}`);
  }
  return parseMcpResponse(response, text, id);
}

async function notify(config, method) {
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method }),
  });
  if (response.status !== 202) {
    const text = await response.text();
    fail(`MCP notification ${method} expected HTTP 202, got ${response.status}${text ? `: ${text.slice(0, 300)}` : "."}`);
  }
}

async function callTool(config, name, args) {
  const result = await rpc(config, "tools/call", { name, arguments: args });
  if (result?.isError === true) {
    const text = Array.isArray(result?.content) ? result.content.map((part) => part?.text || "").join(" ") : "";
    fail(`Aura tool ${name} returned isError${text ? `: ${text.slice(0, 300)}` : "."}`);
  }
  if (!result?.structuredContent || typeof result.structuredContent !== "object") {
    fail(`Aura tool ${name} returned no structuredContent.`);
  }
  return result.structuredContent;
}

async function verifyActive(config) {
  const initialize = await rpc(config, "initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "aura-human-owned-agent-verifier", version: "0.1.0" },
  });
  if (initialize?.protocolVersion !== PROTOCOL_VERSION) {
    fail(`Unexpected negotiated protocol ${initialize?.protocolVersion || "(missing)"}.`);
  }
  await notify(config, "notifications/initialized");

  const listed = await rpc(config, "tools/list", {});
  const actual = (Array.isArray(listed?.tools) ? listed.tools : []).map((tool) => tool?.name).filter(Boolean).sort();
  const expected = [...EXPECTED_TOOLS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`Unexpected MCP tool set: ${actual.join(", ") || "none"}.`);
  }

  const rules = await callTool(config, "get_rules", {});
  if (!Array.isArray(rules.rules) || !rules.rules.some((rule) => typeof rule === "string" && rule.includes("credential is capability, not standing consent"))) {
    fail("Live get_rules is missing the subject-consent rule.");
  }

  const boards = await callTool(config, "list_boards", { limit: 10 });
  if (!Array.isArray(boards.items)) fail("list_boards returned an unexpected shape.");

  console.log("Aura human-owned agent credential is live.");
  console.log(`  MCP: ${config.mcpUrl}`);
  console.log(`  Tools: ${actual.join(", ")}`);
  console.log(`  Visible boards in first page: ${boards.items.length}`);
}

async function verifyRejected(config) {
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  if (response.status !== 401) {
    const text = await response.text();
    fail(`Expected revoked/disabled credential to return HTTP 401, got ${response.status}${text ? `: ${text.slice(0, 300)}` : "."}`);
  }
  const challenge = response.headers.get("www-authenticate") || "";
  if (!/^Bearer\b/i.test(challenge)) fail("Rejected credential response lacked a Bearer challenge.");

  console.log("Aura credential is rejected as expected.");
  console.log(`  MCP: ${config.mcpUrl}`);
  console.log("  Result: HTTP 401 Bearer");
}

function printHelp() {
  console.log(`Aura human-owned agent verifier\n\nUsage:\n  node tools/pilot/verify-agent.mjs --active\n  node tools/pilot/verify-agent.mjs --rejected\n\nRequired environment:\n  AURA_MCP_URL      HTTPS URL ending in /mcp\n  AURA_AGENT_TOKEN  secret Aura credential; never printed by this tool\n\nUse --active immediately after creating/rotating a credential. Use --rejected with the old token after rotation/revocation, or with the current token after disabling the agent/owner.`);
}

async function main() {
  const mode = parseArgs(process.argv.slice(2));
  if (mode === "help") {
    printHelp();
    return;
  }
  const config = loadConfig();
  if (mode === "active") await verifyActive(config);
  else await verifyRejected(config);
}

main().catch((error) => {
  console.error(`Aura agent verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
