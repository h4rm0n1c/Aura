const TOKEN_PREFIX = "aura";
const TOKEN_KIND = "invite";
const TOKEN_VERSION = "v1";
const INVITE_ID_BYTES = 12;
const SECRET_BYTES = 32;
const INVITE_ID_LENGTH = 16;
const SECRET_LENGTH = 43;
const SHA256_HEX_LENGTH = 64;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface ParsedHumanInviteToken {
  readonly inviteId: string;
  readonly token: string;
}

export interface NewHumanInviteToken extends ParsedHumanInviteToken {
  readonly secret: string;
  readonly verifier: string;
}

export async function createHumanInviteToken(
  randomBytes: (length: number) => Uint8Array = secureRandomBytes,
): Promise<NewHumanInviteToken> {
  const inviteId = bytesToBase64Url(randomBytes(INVITE_ID_BYTES));
  const secret = bytesToBase64Url(randomBytes(SECRET_BYTES));
  if (inviteId.length !== INVITE_ID_LENGTH || secret.length !== SECRET_LENGTH) {
    throw new Error("random byte source returned an invalid invitation length");
  }

  const token = `${TOKEN_PREFIX}.${TOKEN_KIND}.${TOKEN_VERSION}.${inviteId}.${secret}`;
  const verifier = await humanInviteVerifier(token);
  return Object.freeze({ inviteId, secret, token, verifier });
}

export function parseHumanInviteToken(token: string): ParsedHumanInviteToken | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (
    parts.length !== 5 ||
    parts[0] !== TOKEN_PREFIX ||
    parts[1] !== TOKEN_KIND ||
    parts[2] !== TOKEN_VERSION
  ) {
    return null;
  }

  const inviteId = parts[3];
  const secret = parts[4];
  if (
    inviteId.length !== INVITE_ID_LENGTH ||
    secret.length !== SECRET_LENGTH ||
    !BASE64URL.test(inviteId) ||
    !BASE64URL.test(secret)
  ) {
    return null;
  }

  return Object.freeze({ inviteId, token });
}

export async function humanInviteVerifier(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyHumanInviteToken(
  token: string,
  expectedVerifier: string,
): Promise<boolean> {
  if (parseHumanInviteToken(token) === null || !isSha256Hex(expectedVerifier)) return false;
  const actual = await humanInviteVerifier(token);
  return constantTimeAsciiEqual(actual, expectedVerifier);
}

/**
 * Normalize the Access identity email used to bind invitations.
 *
 * Aura is comparing an already-authenticated identity, not implementing an
 * email-address parser or mail server. Keep validation deliberately modest:
 * bounded, non-empty local/domain portions, no whitespace/control bytes, then
 * lowercase for stable matching/storage.
 */
export function normalizeInviteEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 320 || /[\s\u0000-\u001f\u007f]/u.test(trimmed)) {
    return null;
  }
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.toLowerCase();
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

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && value.length === SHA256_HEX_LENGTH && /^[0-9a-f]+$/.test(value);
}

function constantTimeAsciiEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
