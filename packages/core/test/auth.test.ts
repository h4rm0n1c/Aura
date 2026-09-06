import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateAgentCredential,
  createAgentCredential,
  parseAgentCredential,
  parseBearerAuthorization,
} from "../src/auth/credentials.ts";
import {
  createHumanInviteToken,
  normalizeInviteEmail,
  parseHumanInviteToken,
  verifyHumanInviteToken,
} from "../src/auth/invites.ts";
import {
  agentHasCapability,
  authenticateHuman,
  humanHasRole,
  principalKey,
  type HumanAuthRecord,
  type VerifiedHumanIdentity,
} from "../src/auth/principals.ts";

const humanIdentity: VerifiedHumanIdentity = {
  provider: "cloudflare_access",
  providerId: "cf-user-123",
  email: "human@example.test",
  displayName: "Identity Provider Name",
};

const humanRecord: HumanAuthRecord = {
  humanId: "human-1",
  provider: "cloudflare_access",
  providerId: "cf-user-123",
  displayName: "Aura Name",
  role: "member",
  status: "active",
};

test("human authentication takes role and display name from Aura record", () => {
  const result = authenticateHuman(humanIdentity, humanRecord);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.principal.role, "member");
  assert.equal(result.principal.email, "human@example.test");
  assert.equal(result.principal.displayName, "Aura Name");
  assert.equal(principalKey(result.principal), "human:human-1");
});

test("human authentication fails closed on identity mismatch and disable", () => {
  assert.deepEqual(authenticateHuman({ ...humanIdentity, providerId: "attacker" }, humanRecord), {
    ok: false,
    reason: "identity_mismatch",
  });
  assert.deepEqual(authenticateHuman(humanIdentity, { ...humanRecord, status: "disabled" }), {
    ok: false,
    reason: "disabled_human",
  });
  assert.deepEqual(authenticateHuman(humanIdentity, null), { ok: false, reason: "unknown_human" });
});

test("human authentication rejects malformed Aura profile data", () => {
  assert.deepEqual(authenticateHuman(humanIdentity, { ...humanRecord, displayName: "" }), {
    ok: false,
    reason: "invalid_human_record",
  });
});

test("human role hierarchy is explicit", () => {
  const member = authenticateHuman(humanIdentity, humanRecord);
  const admin = authenticateHuman(humanIdentity, { ...humanRecord, role: "admin" });
  assert(member.ok && admin.ok);
  if (!member.ok || !admin.ok) return;
  assert.equal(humanHasRole(member.principal, "member"), true);
  assert.equal(humanHasRole(member.principal, "moderator"), false);
  assert.equal(humanHasRole(admin.principal, "moderator"), true);
  assert.equal(humanHasRole(admin.principal, "admin"), true);
});

test("human invitation tokens are high entropy and verifier-only", async () => {
  let counter = 0;
  const deterministic = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) bytes[index] = (counter + index) & 0xff;
    counter += length;
    return bytes;
  };
  const created = await createHumanInviteToken(deterministic);
  const parsed = parseHumanInviteToken(created.token);
  assert(parsed !== null);
  assert.equal(parsed.inviteId, created.inviteId);
  assert.equal("secret" in parsed, false);
  assert.equal(created.inviteId.length, 16);
  assert.equal(created.secret.length, 43);
  assert.match(created.verifier, /^[0-9a-f]{64}$/);
  assert.equal(created.verifier.includes(created.secret), false);
  assert.equal(await verifyHumanInviteToken(created.token, created.verifier), true);
  const tampered = `${created.token.slice(0, -1)}${created.token.endsWith("A") ? "B" : "A"}`;
  assert.equal(await verifyHumanInviteToken(tampered, created.verifier), false);
});

test("invite email normalization is stable and rejects ambiguous empty identities", () => {
  assert.equal(normalizeInviteEmail(" Person@Example.COM "), "person@example.com");
  assert.equal(normalizeInviteEmail("person+tag@example.com"), "person+tag@example.com");
  assert.equal(normalizeInviteEmail("missing-at"), null);
  assert.equal(normalizeInviteEmail("@example.com"), null);
  assert.equal(normalizeInviteEmail("person@"), null);
  assert.equal(normalizeInviteEmail("person @example.com"), null);
});

test("agent credentials are structured, high entropy, and verifier-only", async () => {
  let counter = 0;
  const deterministic = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) bytes[index] = (counter + index) & 0xff;
    counter += length;
    return bytes;
  };
  const created = await createAgentCredential(deterministic);
  const parsed = parseAgentCredential(created.token);
  assert(parsed !== null);
  assert.equal(parsed.credentialId, created.credentialId);
  assert.equal("secret" in parsed, false);
  assert.equal(created.secret.length, 43);
  assert.match(created.verifier, /^[0-9a-f]{64}$/);
  assert.equal(created.verifier.includes(created.secret), false);
  assert.equal(parseBearerAuthorization(`Bearer ${created.token}`), created.token);
  assert.equal(parseBearerAuthorization(`Basic ${created.token}`), null);
  assert.equal(parseBearerAuthorization(`Bearer  ${created.token}`), null);
});

test("agent authentication rejects wrong, revoked, disabled, expired, and overpowered records", async () => {
  const created = await createAgentCredential((length) => new Uint8Array(length).fill(7));
  const validRecord = {
    credentialId: created.credentialId,
    agentId: "agent-1",
    agentStatus: "active" as const,
    verifier: created.verifier,
    capabilities: ["read", "post"],
    status: "active" as const,
    expiresAt: null,
  };
  const valid = await authenticateAgentCredential(created.token, validRecord, 100);
  assert.equal(valid.ok, true);
  if (!valid.ok) return;
  assert.equal(agentHasCapability(valid.principal, "read"), true);
  assert.equal(agentHasCapability(valid.principal, "mark_solution"), false);
  assert.equal(principalKey(valid.principal), `agent:agent-1:${created.credentialId}`);

  const tampered = `${created.token.slice(0, -1)}${created.token.endsWith("A") ? "B" : "A"}`;
  assert.deepEqual(await authenticateAgentCredential(tampered, validRecord, 100), {
    ok: false,
    reason: "credential_mismatch",
  });
  assert.deepEqual(await authenticateAgentCredential(created.token, { ...validRecord, status: "revoked" }, 100), {
    ok: false,
    reason: "revoked_credential",
  });
  assert.deepEqual(await authenticateAgentCredential(created.token, { ...validRecord, agentStatus: "disabled" }, 100), {
    ok: false,
    reason: "disabled_agent",
  });
  assert.deepEqual(await authenticateAgentCredential(created.token, { ...validRecord, expiresAt: 100 }, 100), {
    ok: false,
    reason: "expired_credential",
  });
  assert.deepEqual(await authenticateAgentCredential(created.token, { ...validRecord, capabilities: ["read", "admin"] }, 100), {
    ok: false,
    reason: "invalid_capability_set",
  });
});
