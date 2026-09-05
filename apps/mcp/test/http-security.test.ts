import assert from "node:assert/strict";
import test from "node:test";

import { validateMcpRequestPolicy } from "../src/http-security.ts";

const HOST = "aura-mcp.example.test";

function request(host: string | null, origin?: string): Request {
  const headers = new Headers();
  if (host !== null) headers.set("Host", host);
  if (origin !== undefined) headers.set("Origin", origin);
  return new Request("https://aura-mcp.example.test/mcp", { method: "POST", headers });
}

test("MCP HTTP policy accepts exact host and native clients without Origin", () => {
  assert.deepEqual(validateMcpRequestPolicy(request(HOST), HOST), { ok: true });
  assert.deepEqual(validateMcpRequestPolicy(request(`${HOST}:443`), HOST), { ok: true });
});

test("MCP HTTP policy accepts same-host HTTPS Origin and localhost HTTP for development", () => {
  assert.deepEqual(validateMcpRequestPolicy(request(HOST, `https://${HOST}`), HOST), { ok: true });
  assert.deepEqual(
    validateMcpRequestPolicy(request("localhost:8787", "http://localhost:8787"), "localhost"),
    { ok: true },
  );
});

test("MCP HTTP policy rejects missing, foreign, and userinfo-shaped Host values", () => {
  assert.deepEqual(validateMcpRequestPolicy(request(null), HOST), { ok: false, reason: "host_missing_or_invalid" });
  assert.deepEqual(validateMcpRequestPolicy(request("evil.example"), HOST), { ok: false, reason: "host_not_allowed" });
  assert.deepEqual(validateMcpRequestPolicy(request(`attacker@${HOST}`), HOST), { ok: false, reason: "host_missing_or_invalid" });
});

test("MCP HTTP policy rejects foreign, opaque, userinfo, and insecure public Origins", () => {
  assert.deepEqual(validateMcpRequestPolicy(request(HOST, "https://evil.example"), HOST), { ok: false, reason: "origin_not_allowed" });
  assert.deepEqual(validateMcpRequestPolicy(request(HOST, "null"), HOST), { ok: false, reason: "origin_invalid" });
  assert.deepEqual(validateMcpRequestPolicy(request(HOST, `https://attacker@${HOST}`), HOST), { ok: false, reason: "origin_invalid" });
  assert.deepEqual(validateMcpRequestPolicy(request(HOST, `http://${HOST}`), HOST), { ok: false, reason: "origin_not_allowed" });
});

test("MCP HTTP policy fails closed on malformed deployment hostname", () => {
  assert.deepEqual(validateMcpRequestPolicy(request(HOST), `https://${HOST}`), { ok: false, reason: "invalid_configuration" });
  assert.deepEqual(validateMcpRequestPolicy(request(HOST), "Aura-MCP.example.test"), { ok: false, reason: "invalid_configuration" });
});
