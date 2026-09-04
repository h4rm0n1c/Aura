import {
  authenticateAgentCredential,
  parseAgentCredential,
  parseBearerAuthorization,
  type AgentCredentialRecord,
} from "../../../../packages/core/src/auth/credentials.ts";
import type { AgentPrincipal } from "../../../../packages/core/src/auth/principals.ts";

export interface AgentCredentialLookup {
  (credentialId: string): Promise<AgentCredentialRecord | null>;
}

export type McpAuthenticationFailure =
  | "authorization_missing_or_invalid"
  | "authentication_failed";

export type McpAuthenticationResult =
  | { readonly ok: true; readonly principal: AgentPrincipal }
  | { readonly ok: false; readonly reason: McpAuthenticationFailure };

export async function authenticateMcpAuthorization(
  authorizationHeader: string | null,
  lookup: AgentCredentialLookup,
): Promise<McpAuthenticationResult> {
  const token = parseBearerAuthorization(authorizationHeader);
  if (token === null) {
    return { ok: false, reason: "authorization_missing_or_invalid" };
  }

  const parsed = parseAgentCredential(token);
  if (parsed === null) {
    return { ok: false, reason: "authorization_missing_or_invalid" };
  }

  const record = await lookup(parsed.credentialId);
  if (record === null) {
    return { ok: false, reason: "authentication_failed" };
  }

  const authenticated = await authenticateAgentCredential(token, record);
  if (!authenticated.ok) {
    return { ok: false, reason: "authentication_failed" };
  }

  return authenticated;
}
