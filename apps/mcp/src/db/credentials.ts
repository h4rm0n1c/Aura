import type { AgentCredentialRecord } from "../../../../packages/core/src/auth/credentials.ts";
import type { D1DatabaseLike } from "./d1.ts";

interface CredentialRow {
  credentialId: unknown;
  agentId: unknown;
  verifier: unknown;
  status: unknown;
  agentStatus: unknown;
  expiresAt: unknown;
}

export async function loadAgentCredentialRecord(db: D1DatabaseLike, credentialId: string): Promise<AgentCredentialRecord | null> {
  const row = await db.prepare(`SELECT
      c.credential_id AS credentialId,
      c.agent_id AS agentId,
      c.secret_verifier AS verifier,
      c.status AS status,
      a.status AS agentStatus,
      c.expires_at AS expiresAt
    FROM agent_credentials c
    JOIN agents a ON a.id = c.agent_id
    WHERE c.credential_id = ?1
    LIMIT 1`).bind(credentialId).first<CredentialRow>();
  if (row === null) return null;

  const capabilityRows = await db.prepare(`SELECT capability
    FROM agent_credential_capabilities
    WHERE credential_id = ?1
    ORDER BY capability`).bind(credentialId).all<{ capability: unknown }>();

  return {
    credentialId: row.credentialId as string,
    agentId: row.agentId as string,
    verifier: row.verifier as string,
    status: row.status as "active" | "revoked",
    agentStatus: row.agentStatus as "active" | "disabled",
    expiresAt: row.expiresAt === null ? null : row.expiresAt as number,
    capabilities: capabilityRows.results.map((item) => item.capability),
  };
}
