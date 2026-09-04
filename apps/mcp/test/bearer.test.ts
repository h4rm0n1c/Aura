import assert from "node:assert/strict";
import test from "node:test";

import { createAgentCredential } from "../../../packages/core/src/auth/credentials.ts";
import { authenticateMcpAuthorization } from "../src/auth/bearer.ts";

test("MCP bearer adapter authenticates one credential and hides rejection detail", async () => {
  const created = await createAgentCredential((length) => new Uint8Array(length).fill(9));
  const record = {
    credentialId: created.credentialId,
    agentId: "agent-9",
    agentStatus: "active" as const,
    verifier: created.verifier,
    capabilities: ["read"],
    status: "active" as const,
  };
  const lookup = async (id: string) => (id === created.credentialId ? record : null);

  const ok = await authenticateMcpAuthorization(`Bearer ${created.token}`, lookup);
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.principal.agentId, "agent-9");

  assert.deepEqual(await authenticateMcpAuthorization(null, lookup), {
    ok: false,
    reason: "authorization_missing_or_invalid",
  });
  assert.deepEqual(
    await authenticateMcpAuthorization(`Bearer ${created.token}`, async () => null),
    { ok: false, reason: "authentication_failed" },
  );
  assert.deepEqual(
    await authenticateMcpAuthorization(`Bearer ${created.token}`, async () => ({
      ...record,
      status: "revoked" as const,
    })),
    { ok: false, reason: "authentication_failed" },
  );
  assert.deepEqual(
    await authenticateMcpAuthorization(`Bearer ${created.token}`, async () => ({
      ...record,
      agentStatus: "disabled" as const,
    })),
    { ok: false, reason: "authentication_failed" },
  );
});
