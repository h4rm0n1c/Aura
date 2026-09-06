import { createAgentCredential } from "../../../../packages/core/src/auth/credentials.ts";
import type { HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import {
  authorizeAgentOperationalControl,
  authorizeAgentProvisioning,
} from "../../../../packages/core/src/domain/authorization.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { createAuraId, isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { resultChanges, type D1DatabaseLike } from "../db/d1.ts";

export interface OwnedAgentCredentialSummary {
  readonly credentialId: string;
  readonly status: "active" | "revoked";
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly lastUsedAt: number | null;
}

export interface OwnedAgentSummary {
  readonly agentId: string;
  readonly name: string;
  readonly model: string | null;
  readonly client: string | null;
  readonly status: "active" | "disabled";
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly credentials: readonly OwnedAgentCredentialSummary[];
}

export interface IssuedAgentCredential {
  readonly agentId: string;
  readonly agentName: string;
  readonly credentialId: string;
  readonly token: string;
}

export type AgentServiceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface AgentRow {
  readonly id: unknown;
  readonly name: unknown;
  readonly model: unknown;
  readonly client: unknown;
  readonly status: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

interface CredentialRow {
  readonly agent_id: unknown;
  readonly credential_id: unknown;
  readonly status: unknown;
  readonly created_at: unknown;
  readonly expires_at: unknown;
  readonly last_used_at: unknown;
}

interface AgentOwnerRow {
  readonly owner_human_id: unknown;
  readonly name: unknown;
  readonly status: unknown;
}

export async function listOwnedAgents(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
): Promise<AgentServiceResult<readonly OwnedAgentSummary[]>> {
  let agentRows: readonly AgentRow[];
  let credentialRows: readonly CredentialRow[];
  try {
    const agents = await db.prepare(`
      SELECT id, name, model, client, status, created_at, updated_at
      FROM agents
      WHERE owner_human_id = ?1
      ORDER BY created_at DESC, id DESC
    `).bind(principal.humanId).all<AgentRow>();
    const credentials = await db.prepare(`
      SELECT c.agent_id, c.credential_id, c.status, c.created_at, c.expires_at, c.last_used_at
      FROM agent_credentials c
      JOIN agents a ON a.id = c.agent_id
      WHERE a.owner_human_id = ?1
      ORDER BY c.created_at DESC, c.credential_id DESC
    `).bind(principal.humanId).all<CredentialRow>();
    agentRows = agents.results ?? [];
    credentialRows = credentials.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const credentialsByAgent = new Map<string, OwnedAgentCredentialSummary[]>();
  for (const row of credentialRows) {
    const parsed = parseCredentialRow(row);
    if (parsed === null) return fail("internal_error");
    const list = credentialsByAgent.get(parsed.agentId) ?? [];
    list.push(parsed.credential);
    credentialsByAgent.set(parsed.agentId, list);
  }

  const output: OwnedAgentSummary[] = [];
  for (const row of agentRows) {
    const parsed = parseAgentRow(row);
    if (parsed === null) return fail("internal_error");
    output.push(Object.freeze({
      ...parsed,
      credentials: Object.freeze(credentialsByAgent.get(parsed.agentId) ?? []),
    }));
  }
  return { ok: true, value: Object.freeze(output) };
}

export async function createOwnedAgent(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  input: { readonly name: unknown; readonly model: unknown; readonly client: unknown },
  nowSeconds: number,
): Promise<AgentServiceResult<IssuedAgentCredential>> {
  if (!validTimestamp(nowSeconds)) return fail("validation_error");
  const name = normalizeRequired(input.name, 128);
  const model = normalizeOptional(input.model, 256);
  const client = normalizeOptional(input.client, 256);
  if (name === null || model === undefined || client === undefined) return fail("validation_error");

  const authorized = authorizeAgentProvisioning(principal, principal.humanId);
  if (!authorized.ok) return authorized;

  const agentId = createAuraId("agent");
  const credential = await createAgentCredential();
  try {
    const results = await db.batch([
      db.prepare(`
        INSERT INTO agents
          (id, owner_human_id, name, model, client, status, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6)
      `).bind(agentId, principal.humanId, name, model, client, nowSeconds),
      db.prepare(`
        INSERT INTO agent_credentials
          (credential_id, agent_id, secret_verifier, status, created_at)
        VALUES (?1, ?2, ?3, 'active', ?4)
      `).bind(credential.credentialId, agentId, credential.verifier, nowSeconds),
      db.prepare(`
        INSERT INTO agent_credential_capabilities (credential_id, capability)
        VALUES (?1, 'read')
      `).bind(credential.credentialId),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        VALUES (?1, 'human', ?2, 'agent_created', 'agent', ?3,
                json_object('credential_id', ?4, 'capabilities', json_array('read')))
      `).bind(nowSeconds, principal.humanId, agentId, credential.credentialId),
    ]);
    if (results.slice(0, 4).some((result) => resultChanges(result) !== 1)) return fail("internal_error");
  } catch {
    return fail("internal_error");
  }

  return {
    ok: true,
    value: Object.freeze({
      agentId,
      agentName: name,
      credentialId: credential.credentialId,
      token: credential.token,
    }),
  };
}

export async function rotateOwnedAgentCredential(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  agentId: string,
  nowSeconds: number,
): Promise<AgentServiceResult<IssuedAgentCredential>> {
  if (!isAuraId("agent", agentId) || !validTimestamp(nowSeconds)) return fail("validation_error");
  const agent = await loadAgentOwner(db, agentId);
  if (agent === null) return fail("not_found");
  const authorized = authorizeAgentProvisioning(principal, agent.ownerHumanId);
  if (!authorized.ok) return authorized;
  if (agent.status !== "active") return fail("conflict");

  const credential = await createAgentCredential();
  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE agent_credentials
        SET status = 'revoked', revoked_at = ?1
        WHERE agent_id = ?2 AND status = 'active'
      `).bind(nowSeconds, agentId),
      db.prepare(`
        INSERT INTO agent_credentials
          (credential_id, agent_id, secret_verifier, status, created_at)
        VALUES (?1, ?2, ?3, 'active', ?4)
      `).bind(credential.credentialId, agentId, credential.verifier, nowSeconds),
      db.prepare(`
        INSERT INTO agent_credential_capabilities (credential_id, capability)
        VALUES (?1, 'read')
      `).bind(credential.credentialId),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        VALUES (?1, 'human', ?2, 'agent_credential_rotated', 'agent', ?3,
                json_object('credential_id', ?4, 'capabilities', json_array('read')))
      `).bind(nowSeconds, principal.humanId, agentId, credential.credentialId),
    ]);
    if (resultChanges(results[1]) !== 1 || resultChanges(results[2]) !== 1 || resultChanges(results[3]) !== 1) {
      return fail("internal_error");
    }
  } catch {
    return fail("internal_error");
  }

  return {
    ok: true,
    value: Object.freeze({
      agentId,
      agentName: agent.name,
      credentialId: credential.credentialId,
      token: credential.token,
    }),
  };
}

export async function revokeOwnedAgentCredential(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  agentId: string,
  credentialId: string,
  nowSeconds: number,
): Promise<AgentServiceResult<{ readonly credentialId: string }>> {
  if (!isAuraId("agent", agentId) || !/^[A-Za-z0-9_-]{16}$/.test(credentialId) || !validTimestamp(nowSeconds)) {
    return fail("validation_error");
  }
  const agent = await loadAgentOwner(db, agentId);
  if (agent === null) return fail("not_found");
  const authorized = authorizeAgentOperationalControl(principal, agent.ownerHumanId);
  if (!authorized.ok) return authorized;

  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE agent_credentials
        SET status = 'revoked', revoked_at = ?1
        WHERE credential_id = ?2 AND agent_id = ?3 AND status = 'active'
      `).bind(nowSeconds, credentialId, agentId),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'agent_credential_revoked', 'agent_credential', credential_id,
               json_object('agent_id', agent_id)
        FROM agent_credentials
        WHERE credential_id = ?3 AND agent_id = ?4 AND status = 'revoked' AND revoked_at = ?1
      `).bind(nowSeconds, principal.humanId, credentialId, agentId),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("internal_error");
  }
  return { ok: true, value: Object.freeze({ credentialId }) };
}

export async function setOwnedAgentStatus(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  agentId: string,
  status: "active" | "disabled",
  nowSeconds: number,
): Promise<AgentServiceResult<{ readonly agentId: string; readonly status: "active" | "disabled" }>> {
  if (!isAuraId("agent", agentId) || !validTimestamp(nowSeconds)) return fail("validation_error");
  const agent = await loadAgentOwner(db, agentId);
  if (agent === null) return fail("not_found");
  const authorized = authorizeAgentOperationalControl(principal, agent.ownerHumanId);
  if (!authorized.ok) return authorized;
  if (agent.status === status) return { ok: true, value: Object.freeze({ agentId, status }) };

  const action = status === "active" ? "agent_enabled" : "agent_disabled";
  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE agents
        SET status = ?1, updated_at = ?2
        WHERE id = ?3 AND owner_human_id = ?4
      `).bind(status, nowSeconds, agentId, agent.ownerHumanId),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        VALUES (?1, 'human', ?2, ?3, 'agent', ?4, '{}')
      `).bind(nowSeconds, principal.humanId, action, agentId),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) return fail("conflict");
  } catch {
    return fail("internal_error");
  }
  return { ok: true, value: Object.freeze({ agentId, status }) };
}

async function loadAgentOwner(db: D1DatabaseLike, agentId: string): Promise<{ ownerHumanId: string; name: string; status: "active" | "disabled" } | null> {
  let row: AgentOwnerRow | null;
  try {
    row = await db.prepare(`
      SELECT owner_human_id, name, status
      FROM agents
      WHERE id = ?1
      LIMIT 1
    `).bind(agentId).first<AgentOwnerRow>();
  } catch {
    return null;
  }
  if (row === null || typeof row.owner_human_id !== "string" || typeof row.name !== "string" || (row.status !== "active" && row.status !== "disabled")) {
    return null;
  }
  return { ownerHumanId: row.owner_human_id, name: row.name, status: row.status };
}

function parseAgentRow(row: AgentRow): Omit<OwnedAgentSummary, "credentials"> | null {
  if (
    !isAuraId("agent", row.id) ||
    typeof row.name !== "string" || row.name.length < 1 || row.name.length > 128 ||
    !(row.model === null || (typeof row.model === "string" && row.model.length <= 256)) ||
    !(row.client === null || (typeof row.client === "string" && row.client.length <= 256)) ||
    (row.status !== "active" && row.status !== "disabled") ||
    !validTimestamp(row.created_at) || !validTimestamp(row.updated_at)
  ) return null;
  return {
    agentId: row.id,
    name: row.name,
    model: row.model,
    client: row.client,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseCredentialRow(row: CredentialRow): { agentId: string; credential: OwnedAgentCredentialSummary } | null {
  if (
    !isAuraId("agent", row.agent_id) ||
    typeof row.credential_id !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(row.credential_id) ||
    (row.status !== "active" && row.status !== "revoked") ||
    !validTimestamp(row.created_at) ||
    !(row.expires_at === null || validTimestamp(row.expires_at)) ||
    !(row.last_used_at === null || validTimestamp(row.last_used_at))
  ) return null;
  return {
    agentId: row.agent_id,
    credential: Object.freeze({
      credentialId: row.credential_id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
    }),
  };
}

function normalizeRequired(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= maxLength ? trimmed : null;
}

function normalizeOptional(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length <= maxLength ? trimmed : undefined;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "forbidden" | "not_found" | "validation_error" | "conflict" | "internal_error") {
  return { ok: false as const, error: domainError(code) };
}
