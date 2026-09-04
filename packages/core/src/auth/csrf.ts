const TOKEN_VERSION = "v1";
const NONCE_BYTES = 16;
const NONCE_LENGTH = 22;
const MAC_LENGTH = 43;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DEFAULT_MAX_AGE_SECONDS = 2 * 60 * 60;
const DEFAULT_CLOCK_SKEW_SECONDS = 60;

export interface CsrfIssueOptions {
  readonly key: CryptoKey;
  readonly principalKey: string;
  readonly action: string;
  readonly nowSeconds?: number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

export interface CsrfVerifyOptions {
  readonly key: CryptoKey;
  readonly principalKey: string;
  readonly action: string;
  readonly token: string;
  readonly nowSeconds?: number;
  readonly maxAgeSeconds?: number;
  readonly clockSkewSeconds?: number;
}

export async function importCsrfKey(secret: Uint8Array): Promise<CryptoKey> {
  if (secret.byteLength < 32) {
    throw new Error("CSRF secret must contain at least 32 bytes");
  }

  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueCsrfToken(options: CsrfIssueOptions): Promise<string> {
  validateScope(options.principalKey, "principalKey");
  validateScope(options.action, "action");

  const now = normalizeNow(options.nowSeconds);
  const random = options.randomBytes ?? secureRandomBytes;
  const nonce = bytesToBase64Url(random(NONCE_BYTES));
  if (nonce.length !== NONCE_LENGTH) {
    throw new Error("random byte source returned an invalid CSRF nonce length");
  }

  const message = csrfMessage(options.principalKey, options.action, now, nonce);
  const mac = await crypto.subtle.sign("HMAC", options.key, encoder.encode(message));
  return `${TOKEN_VERSION}.${now}.${nonce}.${bytesToBase64Url(new Uint8Array(mac))}`;
}

export async function verifyCsrfToken(options: CsrfVerifyOptions): Promise<boolean> {
  if (!validScope(options.principalKey) || !validScope(options.action)) {
    return false;
  }

  const parsed = parseToken(options.token);
  if (parsed === null) {
    return false;
  }

  const now = normalizeNow(options.nowSeconds);
  const maxAge = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const clockSkew = options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  if (!validWindow(maxAge) || !validWindow(clockSkew)) {
    return false;
  }

  if (parsed.issuedAt > now + clockSkew || now - parsed.issuedAt > maxAge) {
    return false;
  }

  const mac = base64UrlToBytes(parsed.mac);
  if (mac === null) {
    return false;
  }

  const message = csrfMessage(
    options.principalKey,
    options.action,
    parsed.issuedAt,
    parsed.nonce,
  );
  return crypto.subtle.verify("HMAC", options.key, mac, encoder.encode(message));
}

export function csrfAction(method: string, pathname: string): string {
  const normalizedMethod = method.toUpperCase();
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(normalizedMethod)) {
    throw new Error("CSRF scope requires a state-changing HTTP method");
  }
  if (!pathname.startsWith("/") || pathname.includes("\n") || pathname.includes("\r")) {
    throw new Error("invalid pathname for CSRF scope");
  }
  return `${normalizedMethod} ${pathname}`;
}

const encoder = new TextEncoder();

function parseToken(token: string): {
  readonly issuedAt: number;
  readonly nonce: string;
  readonly mac: string;
} | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    return null;
  }

  const issuedText = parts[1];
  const nonce = parts[2];
  const mac = parts[3];
  if (!/^(0|[1-9][0-9]*)$/.test(issuedText)) {
    return null;
  }

  const issuedAt = Number(issuedText);
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) {
    return null;
  }
  if (
    nonce.length !== NONCE_LENGTH ||
    mac.length !== MAC_LENGTH ||
    !BASE64URL.test(nonce) ||
    !BASE64URL.test(mac)
  ) {
    return null;
  }

  return { issuedAt, nonce, mac };
}

function csrfMessage(
  principalKey: string,
  action: string,
  issuedAt: number,
  nonce: string,
): string {
  return `aura-csrf-v1\n${principalKey}\n${action}\n${issuedAt}\n${nonce}`;
}

function validateScope(value: string, name: string): void {
  if (!validScope(value)) {
    throw new Error(`${name} must be non-empty and single-line`);
  }
}

function validScope(value: string): boolean {
  return value.length > 0 && !value.includes("\n") && !value.includes("\r");
}

function normalizeNow(value: number | undefined): number {
  const now = value ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error("invalid current time");
  }
  return now;
}

function validWindow(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function secureRandomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length);
  crypto.getRandomValues(output);
  return output;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!BASE64URL.test(value)) {
    return null;
  }

  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + padding);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      output[index] = binary.charCodeAt(index);
    }
    return bytesToBase64Url(output) === value ? output : null;
  } catch {
    return null;
  }
}
