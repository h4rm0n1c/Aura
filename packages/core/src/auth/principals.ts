export const HUMAN_ROLES = ["member", "moderator", "admin"] as const;
export type HumanRole = (typeof HUMAN_ROLES)[number];

export const AGENT_CAPABILITIES = ["read", "post", "mark_solution"] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export type HumanStatus = "active" | "disabled";
export type AgentStatus = "active" | "disabled";
export type AgentCredentialStatus = "active" | "revoked";

export interface VerifiedHumanIdentity {
  readonly provider: "cloudflare_access";
  readonly providerId: string;
  readonly email: string;
  readonly displayName: string | null;
}

export interface HumanAuthRecord {
  readonly humanId: string;
  readonly provider: "cloudflare_access";
  readonly providerId: string;
  readonly role: HumanRole;
  readonly status: HumanStatus;
}

export interface HumanPrincipal {
  readonly kind: "human";
  readonly humanId: string;
  readonly role: HumanRole;
  readonly email: string;
  readonly displayName: string | null;
}

export interface AgentPrincipal {
  readonly kind: "agent";
  readonly agentId: string;
  readonly credentialId: string;
  readonly capabilities: readonly AgentCapability[];
}

export type Principal = HumanPrincipal | AgentPrincipal;

export type HumanAuthFailure =
  | "unknown_human"
  | "disabled_human"
  | "identity_mismatch"
  | "invalid_human_record";

export type HumanAuthResult =
  | { readonly ok: true; readonly principal: HumanPrincipal }
  | { readonly ok: false; readonly reason: HumanAuthFailure };

const HUMAN_ROLE_SET = new Set<string>(HUMAN_ROLES);
const AGENT_CAPABILITY_SET = new Set<string>(AGENT_CAPABILITIES);

export function isHumanRole(value: unknown): value is HumanRole {
  return typeof value === "string" && HUMAN_ROLE_SET.has(value);
}

export function isAgentCapability(value: unknown): value is AgentCapability {
  return typeof value === "string" && AGENT_CAPABILITY_SET.has(value);
}

export function authenticateHuman(
  identity: VerifiedHumanIdentity,
  record: HumanAuthRecord | null,
): HumanAuthResult {
  if (record === null) {
    return { ok: false, reason: "unknown_human" };
  }

  if (
    !nonEmpty(record.humanId) ||
    !nonEmpty(record.providerId) ||
    record.provider !== "cloudflare_access" ||
    !isHumanRole(record.role) ||
    (record.status !== "active" && record.status !== "disabled")
  ) {
    return { ok: false, reason: "invalid_human_record" };
  }

  if (
    identity.provider !== record.provider ||
    identity.providerId !== record.providerId
  ) {
    return { ok: false, reason: "identity_mismatch" };
  }

  if (record.status !== "active") {
    return { ok: false, reason: "disabled_human" };
  }

  return {
    ok: true,
    principal: {
      kind: "human",
      humanId: record.humanId,
      role: record.role,
      email: identity.email,
      displayName: identity.displayName,
    },
  };
}

export function humanHasRole(
  principal: HumanPrincipal,
  required: HumanRole,
): boolean {
  const rank: Record<HumanRole, number> = {
    member: 0,
    moderator: 1,
    admin: 2,
  };
  return rank[principal.role] >= rank[required];
}

export function agentHasCapability(
  principal: AgentPrincipal,
  capability: AgentCapability,
): boolean {
  return principal.capabilities.includes(capability);
}

export function principalKey(principal: Principal): string {
  return principal.kind === "human"
    ? `human:${principal.humanId}`
    : `agent:${principal.agentId}:${principal.credentialId}`;
}

export function validateAgentCapabilities(
  values: readonly unknown[],
): readonly AgentCapability[] | null {
  const output: AgentCapability[] = [];
  const seen = new Set<AgentCapability>();

  for (const value of values) {
    if (!isAgentCapability(value)) {
      return null;
    }
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }

  return Object.freeze(output);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
