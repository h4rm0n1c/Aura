import {
  authenticateHuman,
  type HumanAuthRecord,
  type HumanPrincipal,
} from "../../../../packages/core/src/auth/principals.ts";
import {
  readCloudflareAccessIdentity,
  type CloudflareAccessContextLike,
} from "./access.ts";

export interface HumanRecordLookup {
  (providerId: string): Promise<HumanAuthRecord | null>;
}

export type WebAuthenticationFailure =
  | "access_rejected"
  | "human_not_authorized";

export type WebAuthenticationResult =
  | { readonly ok: true; readonly principal: HumanPrincipal }
  | { readonly ok: false; readonly reason: WebAuthenticationFailure };

export async function authenticateWebAccess(
  access: CloudflareAccessContextLike | undefined,
  expectedAudience: string,
  lookup: HumanRecordLookup,
): Promise<WebAuthenticationResult> {
  const verified = await readCloudflareAccessIdentity(access, expectedAudience);
  if (!verified.ok) {
    return { ok: false, reason: "access_rejected" };
  }

  const record = await lookup(verified.identity.providerId);
  const authenticated = authenticateHuman(verified.identity, record);
  if (!authenticated.ok) {
    return { ok: false, reason: "human_not_authorized" };
  }

  return authenticated;
}
