import assert from "node:assert/strict";
import test from "node:test";

import { handleAuraWebRequest, type AuraWebEnv } from "../src/index.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";
import { REPLY_CLIENT_JS } from "../src/replies/client.ts";

class HumanStatement implements D1PreparedStatementLike {
  async first<T>(): Promise<T | null> {
    return {
      id: "hum_AAAAAAAAAAAAAAAAAAAAAA",
      identity_provider: "cloudflare_access",
      provider_id: "cf-user",
      display_name: "Aura User",
      role: "admin",
      status: "active",
    } as T;
  }

  bind(): D1PreparedStatementLike { return this; }
  async all<T>(): Promise<D1ResultLike<T>> { return { results: [] }; }
  async run<T>(): Promise<D1ResultLike<T>> { return { success: true, meta: { changes: 0 } }; }
}

class HumanDb implements D1DatabaseLike {
  prepare(): D1PreparedStatementLike { return new HumanStatement(); }
  async batch(): Promise<readonly D1ResultLike[]> { return []; }
}

const env: AuraWebEnv = {
  DB: new HumanDb(),
  AURA_ACCESS_AUD: "aura-web-aud",
  AURA_CSRF_KEY_HEX: "11".repeat(32),
  AURA_MCP_URL: "https://aura-mcp.example/mcp",
};

const access = {
  aud: "aura-web-aud",
  async getIdentity(): Promise<unknown> {
    return { id: "cf-user", email: "user@example.test", name: "Provider Name" };
  },
};

test("public rules preserve authenticated member navigation and keep Replies rightmost", async () => {
  const response = await handleAuraWebRequest(
    new Request("https://aura.example/rules"),
    env,
    { access },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Aura User · admin/);
  assert.match(html, /href="\/agents"/);
  assert.match(html, /href="\/account"/);
  assert.match(html, /href="\/admin"/);
  assert.match(html, /href="\/replies"/);
  assert.match(html, /<script defer src="\/aura-replies\.js"><\/script>/);

  const nav = html.match(/<nav class="primary-nav"[^>]*>(.*?)<\/nav>/s)?.[1] ?? "";
  const repliesAt = nav.indexOf('href="/replies"');
  assert.ok(repliesAt > nav.indexOf('href="/agents"'));
  assert.ok(repliesAt > nav.indexOf('href="/account"'));
  assert.ok(repliesAt > nav.indexOf('href="/admin"'));
});

test("reply notification enhancement refreshes without a page reload", () => {
  assert.doesNotThrow(() => new Function(REPLY_CLIENT_JS));
  assert.match(REPLY_CLIENT_JS, /REFRESH_MS = 30_000/);
  assert.match(REPLY_CLIENT_JS, /window\.setInterval/);
  assert.match(REPLY_CLIENT_JS, /visibilitychange/);
  assert.match(REPLY_CLIENT_JS, /window\.addEventListener\("focus"/);
  assert.match(REPLY_CLIENT_JS, /cache: "no-store"/);
  assert.match(REPLY_CLIENT_JS, /refreshSummary\(true\)/);
  assert.doesNotMatch(REPLY_CLIENT_JS, /innerHTML/);
  assert.doesNotMatch(REPLY_CLIENT_JS, /location\s*=/);
});
