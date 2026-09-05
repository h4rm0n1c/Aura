import {
  type AgentCapability,
  type AgentCredentialStatus,
  type AgentPrincipal,
  type AgentStatus,
  validateAgentCapabilities,
} from "./principals.ts";

const TOKEN_PREFIX = "aura";
const TOKEN_VERSION = "v1";
const CREDENTIAL_ID_BYTES = 12;
const SECRET_BYTES = 32;
const CREDENTIAL_ID_LENGTH = 16;
const SECRET_LENGTH = 43;
const SHA256_HEX_LENGTH = 64;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface ParsedAgentCredential {
  readonly credentialId: string;
  readonly token: string;
}

export interface NewAgentCredential extends ParsedAgentCredential {
  readonly secret: string;
  readonly verifier: string;
}

export interface AgentCredentialRecord {
  readonly credentialId: string;
  readonly agentId: string;
  readonly agentStatus: AgentStatus;
  readonly verifier: string;
  readonly capabilities: readonly unknown[];
  readonly status: AgentCredentialStatus;
  readonly expiresAt: number | null;
}

export type AgentAuthFailure =
  | "invalid_credential"
  | "credential_mismatch"
  | "revoked_credential"
  | "expired_credential"
  | "disabled_agent"
  | "invalid_credential_record"
  | "invalid_capability_set";

export type AgentAuthResult =
  | { readonly ok: true; readonly principal: AgentPrincipal }
  | { readonly ok: false; readonly reason: AgentAuthFailure };

export async function createAgentCredential(
  randomBytes: (length: number) => Uint8Array = secureRandomBytes,
): Promise<NewAgentCredential> {
  const credentialId = bytesToBase64Url(randomBytes(CREDENTIAL_ID_BYTES));
  const secret = bytesToBase64Url(randomBytes(SECRET_BYTES));

  if (
    credentialId.length !== CREDENTIAL_ID_LENGTH ||
    secret.length !== SECRET_LENGTH
  ) {
    throw new Error("random byte source returned an invalid length");
  }

  const token = `${TOKEN_PREFIX}.${TOKEN_VERSION}.${credentialId}.${secret}`;
  const verifier = await credentialVerifier(token);
  return Object.freeze({ credentialId, secret, token, verifier });
}

export function parseAgentCredential(token: string): ParsedAgentCredential | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX || parts[1] !== TOKEN_VERSION) {
    return null;
  }

  const credentialId = parts[2];
  const secret = parts[3];
  if (
    credentialId.length !== CREDENTIAL_ID_LENGTH ||
    secret.length !== SECRET_LENGTH ||
    !BASE64URL.test(credentialId) ||
    !BASE64URL.test(secret)
  ) {
    return null;
  }

  return Object.freeze({ credentialId, token });
}

export function parseBearerAuthorization(header: string | null): string | null {
  if (header === null) return null;

  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (match === null) return null;

  const token = match[1];
  return parseAgentCredential(token) === null ? null : token;
}

export async function credentialVerifier(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function authenticateAgentCredential(
  token: string,
  record: AgentCredentialRecord,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AgentAuthResult> {
  const parsed = parseAgentCredential(token);
  if (parsed === null) return { ok: false, reason: "invalid_credential" };

  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    return { ok: false, reason: "invalid_credential_record" };
  }

  if (
    !nonEmpty(record.credentialId) ||
    !nonEmpty(record.agentId) ||
    !isSha256Hex(record.verifier) ||
    (record.status !== "active" && record.status !== "revoked") ||
    (record.agentStatus !== "active" && record.agentStatus !== "disabled") ||
    (record.expiresAt !== null &&
      (!Number.isSafeInteger(record.expiresAt) || record.expiresAt < 0)) ||
    !Array.isArray(record.capabilities)
  ) {
    return { ok: false, reason: "invalid_credential_record" };
  }

  if (parsed.credentialId !== record.credentialId) {
    return { ok: false, reason: "credential_mismatch" };
  }
  if (record.agentStatus !== "active") {
    return { ok: false, reason: "disabled_agent" };
  }
  if (record.status !== "active") {
    return { ok: false, reason: "revoked_credential" };
  }
  if (record.expiresAt !== null && record.expiresAt <= nowSeconds) {
    return { ok: false, reason: "expired_credential" };
  }

  const verifier = await credentialVerifier(token);
  if (!constantTimeAsciiEqual(verifier, record.verifier)) {
    return { ok: false, reason: "credential_mismatch" };
  }

  const capabilities = validateAgentCapabilities(record.capabilities);
  if (capabilities === null) {
    return { ok: false, reason: "invalid_capability_set" };
  }

  return {
    ok: true,
    principal: Object.freeze({
      kind: "agent",
      agentId: record.agentId,
      credentialId: record.credentialId,
      capabilities,
    }),
  };
}

function secureRandomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length);
  crypto.getRandomValues(output);
  return output;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function constantTimeAsciiEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isSha256Hex(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === SHA256_HEX_LENGTH &&
    /^[0-9a-f]+$/.test(value)
  );
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type { AgentCapability };
