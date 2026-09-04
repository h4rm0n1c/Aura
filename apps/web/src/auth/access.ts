import type { VerifiedHumanIdentity } from "../../../../packages/core/src/auth/principals.ts";

export interface CloudflareAccessContextLike {
  readonly aud: string;
  getIdentity(): Promise<unknown>;
}

export type AccessIdentityFailure =
  | "access_missing"
  | "audience_mismatch"
  | "identity_lookup_failed"
  | "identity_missing"
  | "identity_invalid";

export type AccessIdentityResult =
  | { readonly ok: true; readonly identity: VerifiedHumanIdentity }
  | { readonly ok: false; readonly reason: AccessIdentityFailure };

export async function readCloudflareAccessIdentity(
  access: CloudflareAccessContextLike | undefined,
  expectedAudience: string,
): Promise<AccessIdentityResult> {
  if (access === undefined) {
    return { ok: false, reason: "access_missing" };
  }

  if (
    !nonEmpty(expectedAudience) ||
    typeof access.aud !== "string" ||
    access.aud !== expectedAudience
  ) {
    return { ok: false, reason: "audience_mismatch" };
  }

  let raw: unknown;
  try {
    raw = await access.getIdentity();
  } catch {
    return { ok: false, reason: "identity_lookup_failed" };
  }
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "identity_missing" };
  }
  if (!isRecord(raw)) {
    return { ok: false, reason: "identity_invalid" };
  }

  const id = raw.id;
  const email = raw.email;
  const name = raw.name;
  if (!nonEmpty(id) || !nonEmpty(email)) {
    return { ok: false, reason: "identity_invalid" };
  }
  if (name !== undefined && name !== null && typeof name !== "string") {
    return { ok: false, reason: "identity_invalid" };
  }

  return {
    ok: true,
    identity: Object.freeze({
      provider: "cloudflare_access",
      providerId: id,
      email,
      displayName: typeof name === "string" && name.trim().length > 0 ? name : null,
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
