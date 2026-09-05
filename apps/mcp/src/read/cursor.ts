import { isAuraId } from "../../../../packages/core/src/domain/ids.ts";

const MAX_CURSOR_JSON_BYTES = 192;

type CursorPayload =
  | { readonly v: 1; readonly k: "boards"; readonly slug: string; readonly id: string }
  | { readonly v: 1; readonly k: "threads" | "search"; readonly ts: number; readonly id: string }
  | { readonly v: 1; readonly k: "posts"; readonly sequence: number };

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).byteLength > MAX_CURSOR_JSON_BYTES) {
    throw new Error("cursor payload too large");
  }
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeCursor(
  expectedKind: CursorPayload["k"],
  value: string | undefined,
): CursorPayload | null {
  if (value === undefined) return null;

  const bytes = base64UrlToBytes(value);
  if (bytes === null || bytes.byteLength > MAX_CURSOR_JSON_BYTES) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!isRecord(parsed) || parsed.v !== 1 || parsed.k !== expectedKind) return null;

    if (expectedKind === "boards") {
      return hasExactKeys(parsed, ["v", "k", "slug", "id"]) &&
        typeof parsed.slug === "string" &&
        parsed.slug.length <= 64 &&
        isAuraId("board", parsed.id)
        ? { v: 1, k: "boards", slug: parsed.slug, id: parsed.id }
        : null;
    }

    if (expectedKind === "posts") {
      return hasExactKeys(parsed, ["v", "k", "sequence"]) &&
        Number.isSafeInteger(parsed.sequence) &&
        (parsed.sequence as number) >= 0
        ? { v: 1, k: "posts", sequence: parsed.sequence as number }
        : null;
    }

    const idKind = expectedKind === "threads" ? "thread" : "post";
    return hasExactKeys(parsed, ["v", "k", "ts", "id"]) &&
      Number.isSafeInteger(parsed.ts) &&
      (parsed.ts as number) >= 0 &&
      isAuraId(idKind, parsed.id)
      ? { v: 1, k: expectedKind, ts: parsed.ts as number, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  if (Object.keys(record).length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}
