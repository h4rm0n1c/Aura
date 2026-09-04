import assert from "node:assert/strict";
import test from "node:test";

import { readCloudflareAccessIdentity } from "../src/auth/access.ts";
import { authenticateWebAccess } from "../src/auth/authenticate.ts";

test("Access adapter requires expected audience and identity id/email", async () => {
  const access = {
    aud: "aura-web-aud",
    async getIdentity(): Promise<unknown> {
      return { id: "cf-id-1", email: "user@example.test", name: "User" };
    },
  };

  assert.deepEqual(await readCloudflareAccessIdentity(undefined, "aura-web-aud"), {
    ok: false,
    reason: "access_missing",
  });
  assert.deepEqual(await readCloudflareAccessIdentity(access, "wrong-aud"), {
    ok: false,
    reason: "audience_mismatch",
  });

  const result = await readCloudflareAccessIdentity(access, "aura-web-aud");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.identity, {
    provider: "cloudflare_access",
    providerId: "cf-id-1",
    email: "user@example.test",
    displayName: "User",
  });
});

test("Access adapter does not accept client-shaped identity without required fields", async () => {
  const missingId = {
    aud: "aura-web-aud",
    async getIdentity(): Promise<unknown> {
      return { email: "user@example.test", role: "admin" };
    },
  };

  assert.deepEqual(await readCloudflareAccessIdentity(missingId, "aura-web-aud"), {
    ok: false,
    reason: "identity_invalid",
  });
});

test("Access adapter fails closed when identity lookup throws", async () => {
  const access = {
    aud: "aura-web-aud",
    async getIdentity(): Promise<unknown> {
      throw new Error("provider failure");
    },
  };

  assert.deepEqual(await readCloudflareAccessIdentity(access, "aura-web-aud"), {
    ok: false,
    reason: "identity_lookup_failed",
  });
});

test("web auth binds verified Access id to Aura record and rejects disabled users", async () => {
  const access = {
    aud: "aura-web-aud",
    async getIdentity(): Promise<unknown> {
      return { id: "cf-id-2", email: "member@example.test", role: "admin" };
    },
  };
  const record = {
    humanId: "human-2",
    provider: "cloudflare_access" as const,
    providerId: "cf-id-2",
    role: "member" as const,
    status: "active" as const,
  };

  const ok = await authenticateWebAccess(access, "aura-web-aud", async () => record);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.principal.role, "member");

  assert.deepEqual(
    await authenticateWebAccess(access, "aura-web-aud", async () => ({
      ...record,
      status: "disabled" as const,
    })),
    { ok: false, reason: "human_not_authorized" },
  );
});
