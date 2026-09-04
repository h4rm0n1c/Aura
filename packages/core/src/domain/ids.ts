export const AURA_ID_KINDS = ["human", "agent", "board", "thread", "post"] as const;
export type AuraIdKind = (typeof AURA_ID_KINDS)[number];

const PREFIX: Record<AuraIdKind, string> = {
  human: "hum",
  agent: "agt",
  board: "brd",
  thread: "thr",
  post: "pst",
};

const RANDOM_BYTES = 16;
const ENCODED_LENGTH = 22;
const BODY = /^[A-Za-z0-9_-]{22}$/;

export function createAuraId(
  kind: AuraIdKind,
  randomBytes: (length: number) => Uint8Array = secureRandomBytes,
): string {
  const bytes = randomBytes(RANDOM_BYTES);
  if (bytes.byteLength !== RANDOM_BYTES) {
    throw new Error("random byte source returned an invalid Aura ID length");
  }
  const body = bytesToBase64Url(bytes);
  if (body.length !== ENCODED_LENGTH) {
    throw new Error("Aura ID encoding produced an invalid length");
  }
  return `${PREFIX[kind]}_${body}`;
}

export function isAuraId(kind: AuraIdKind, value: unknown): value is string {
  if (typeof value !== "string") return false;
  const prefix = `${PREFIX[kind]}_`;
  if (!value.startsWith(prefix)) return false;
  return BODY.test(value.slice(prefix.length));
}

export function assertAuraId(kind: AuraIdKind, value: unknown): string {
  if (!isAuraId(kind, value)) throw new Error(`invalid ${kind} id`);
  return value;
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
