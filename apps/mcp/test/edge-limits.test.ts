import assert from "node:assert/strict";
import test from "node:test";

import { requestBodyWithinLimit, requestHasJsonContentType } from "../src/body-limit.ts";
import { authRateKey, checkRateLimit, type RateLimiterLike } from "../src/rate-limit.ts";

class FakeLimiter implements RateLimiterLike {
  readonly seen: string[] = [];
  private readonly success: boolean;
  private readonly shouldThrow: boolean;
  constructor(success = true, shouldThrow = false) {
    this.success = success;
    this.shouldThrow = shouldThrow;
  }
  async limit(options: { readonly key: string }): Promise<{ readonly success: boolean }> {
    this.seen.push(options.key);
    if (this.shouldThrow) throw new Error("binding unavailable");
    return { success: this.success };
  }
}

test("rate-limit adapter is keyed without exposing bearer material and fails closed on binding errors", async () => {
  const limiter = new FakeLimiter();
  assert.deepEqual(await checkRateLimit(limiter, "agt_AAAAAAAAAAAAAAAAAAAAAA"), { ok: true });
  assert.deepEqual(limiter.seen, ["agt_AAAAAAAAAAAAAAAAAAAAAA"]);
  assert.deepEqual(await checkRateLimit(new FakeLimiter(false), "agent"), { ok: false, unavailable: false });
  assert.deepEqual(await checkRateLimit(new FakeLimiter(true, true), "agent"), { ok: false, unavailable: true });
});

test("pre-auth rate key uses Cloudflare client IP only and has a bounded fallback", () => {
  const request = new Request("https://aura.example/mcp", { headers: { "CF-Connecting-IP": "203.0.113.7", Authorization: "Bearer SECRET" } });
  assert.equal(authRateKey(request), "203.0.113.7");
  assert.equal(authRateKey(new Request("https://aura.example/mcp")), "unknown");
});

test("MCP request-body limiter accepts small requests and rejects oversized or dishonest lengths", async () => {
  assert.equal(await requestBodyWithinLimit(new Request("https://aura.example/mcp", { method: "POST", body: "{}" }), 16), true);
  assert.equal(await requestBodyWithinLimit(new Request("https://aura.example/mcp", { method: "POST", body: "x".repeat(17) }), 16), false);
  assert.equal(await requestBodyWithinLimit(new Request("https://aura.example/mcp", { method: "POST", headers: { "Content-Length": "999" }, body: "{}" }), 16), false);
});

test("MCP POSTs require application/json while allowing media-type parameters", () => {
  assert.equal(requestHasJsonContentType(new Request("https://aura.example/mcp", { method: "GET" })), true);
  assert.equal(requestHasJsonContentType(new Request("https://aura.example/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })), true);
  assert.equal(requestHasJsonContentType(new Request("https://aura.example/mcp", { method: "POST", headers: { "Content-Type": "Application/JSON; charset=utf-8" }, body: "{}" })), true);
  assert.equal(requestHasJsonContentType(new Request("https://aura.example/mcp", { method: "POST", body: "{}" })), false);
  assert.equal(requestHasJsonContentType(new Request("https://aura.example/mcp", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })), false);
});
