import assert from "node:assert/strict";
import test from "node:test";

import { handleAuraWebRequest, type AuraWebEnv } from "../src/index.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";

class HumanLookupStatement implements D1PreparedStatementLike {
  readonly role: "member" | "admin";
  values: readonly unknown[] = [];

  constructor(role: "member" | "admin") {
    this.role = role;
  }

  bind(...values: readonly unknown[]): D1PreparedStatementLike {
    const next = new HumanLookupStatement(this.role);
    next.values = values;
    return next;
  }

  async first<T>(): Promise<T | null> {
    return {
      id: "hum_AAAAAAAAAAAAAAAAAAAAAA",
      identity_provider: "cloudflare_access",
      provider_id: "cf-user",
      display_name: "Aura User",
      role: this.role,
      status: "active",
    } as T;
  }

  async all<T>(): Promise<D1ResultLike<T>> {
    return { results: [] };
  }

  async run<T>(): Promise<D1ResultLike<T>> {
    return { success: true, meta: { changes: 0 } };
  }
}

class HumanLookupDb implements D1DatabaseLike {
  readonly role: "member" | "admin";

  constructor(role: "member" | "admin") {
    this.role = role;
  }

  prepare(): D1PreparedStatementLike {
    return new HumanLookupStatement(this.role);
  }

  async batch(): Promise<readonly D1ResultLike[]> {
    return [];
  }
}

function env(role: "member" | "admin"): AuraWebEnv {
  return {
    DB: new HumanLookupDb(role),
    AURA_ACCESS_AUD: "aura-web-aud",
    AURA_CSRF_KEY_HEX: "11".repeat(32),
  };
}

const access = {
  aud: "aura-web-aud",
  async getIdentity(): Promise<unknown> {
    return { id: "cf-user", email: "user@example.test", name: "Provider Name" };
  },
};

test("web shell serves rules with restrictive browser headers", async () => {
  const response = await handleAuraWebRequest(
    new Request("https://aura.example/rules"),
    { DB: new HumanLookupDb("member") },
    {},
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'none'/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(await response.text(), /Forbidden subjects/);
});

test("web runtime fails closed until Access audience and CSRF secret are configured", async () => {
  const response = await handleAuraWebRequest(
    new Request("https://aura.example/"),
    { DB: new HumanLookupDb("member") },
    { access },
  );
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Setup incomplete/);
});

test("admin route is server-authorized and ordinary members are denied", async () => {
  const member = await handleAuraWebRequest(
    new Request("https://aura.example/admin"),
    env("member"),
    { access },
  );
  assert.equal(member.status, 403);
  assert.doesNotMatch(await member.text(), /Open administration/);

  const admin = await handleAuraWebRequest(
    new Request("https://aura.example/admin"),
    env("admin"),
    { access },
  );
  assert.equal(admin.status, 200);
  const html = await admin.text();
  assert.match(html, /Administration/);
  assert.match(html, /href="\/admin\/invites"/);
  assert.match(html, /href="\/admin\/users"/);
  assert.match(html, /href="\/admin\/boards"/);
});

test("admin invitation and user pages route through authenticated runtime", async () => {
  const invites = await handleAuraWebRequest(
    new Request("https://aura.example/admin/invites"),
    env("admin"),
    { access },
  );
  assert.equal(invites.status, 200);
  const inviteHtml = await invites.text();
  assert.match(inviteHtml, /Create DM invite link/);
  assert.match(inviteHtml, /Create email-bound invitation/);

  const users = await handleAuraWebRequest(
    new Request("https://aura.example/admin/users"),
    env("admin"),
    { access },
  );
  assert.equal(users.status, 200);
  assert.match(await users.text(), /Disabling a human immediately/);

  const denied = await handleAuraWebRequest(
    new Request("https://aura.example/admin/users"),
    env("member"),
    { access },
  );
  assert.equal(denied.status, 403);
});

test("authenticated humans get an owner-scoped agent provisioning surface", async () => {
  const response = await handleAuraWebRequest(
    new Request("https://aura.example/agents"),
    env("member"),
    { access },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Your agents/);
  assert.match(html, /Create agent and credential/);
  assert.match(html, /belongs to your human account/);
  assert.match(html, /explicitly authorize Aura use for each subject/);
  assert.match(html, /read-only MCP credentials/);
});

test("same-origin form POST survives no-referrer Origin null but still requires CSRF", async () => {
  const token = `aura.invite.v1.${"A".repeat(16)}.${"B".repeat(43)}`;
  const response = await handleAuraWebRequest(
    new Request(`https://aura.example/invite/${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "null",
        "Sec-Fetch-Site": "same-origin",
      },
      body: "csrf=invalid",
    }),
    env("member"),
    { access },
  );

  assert.equal(response.status, 403);
  const body = await response.text();
  assert.match(body, /Form expired/);
  assert.doesNotMatch(body, /Cross-origin form submission rejected/);
});
