import {
  createHumanInviteToken,
  normalizeInviteEmail,
  parseHumanInviteToken,
  verifyHumanInviteToken,
} from "../../../../packages/core/src/auth/invites.ts";
import type {
  HumanPrincipal,
  VerifiedHumanIdentity,
} from "../../../../packages/core/src/auth/principals.ts";
import { authorizeInviteAdministration } from "../../../../packages/core/src/domain/authorization.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import { createAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { resultChanges, type D1DatabaseLike } from "../db/d1.ts";

const DEFAULT_INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface CreatedMemberInvite {
  readonly inviteId: string;
  readonly email: string;
  readonly token: string;
  readonly expiresAt: number;
}

export interface AcceptedHumanInvite {
  readonly humanId: string;
  readonly role: "member" | "admin";
}

export type InviteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface InviteRow {
  readonly invite_id: unknown;
  readonly secret_verifier: unknown;
  readonly email: unknown;
  readonly kind: unknown;
  readonly initial_role: unknown;
  readonly status: unknown;
  readonly expires_at: unknown;
}

interface ParsedInviteRow {
  readonly inviteId: string;
  readonly verifier: string;
  readonly email: string;
  readonly kind: "member" | "bootstrap_admin";
  readonly role: "member" | "admin";
  readonly status: "pending" | "accepted" | "revoked";
  readonly expiresAt: number;
}

export async function createMemberInvite(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  emailInput: unknown,
  nowSeconds: number,
  ttlSeconds = DEFAULT_INVITE_TTL_SECONDS,
): Promise<InviteResult<CreatedMemberInvite>> {
  const authorized = authorizeInviteAdministration(principal);
  if (!authorized.ok) return authorized;
  if (!validTimestamp(nowSeconds) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 30 * 24 * 60 * 60) {
    return fail("validation_error");
  }

  const email = normalizeInviteEmail(emailInput);
  if (email === null) return fail("validation_error");

  const created = await createHumanInviteToken();
  const expiresAt = nowSeconds + ttlSeconds;
  if (!Number.isSafeInteger(expiresAt)) return fail("validation_error");

  try {
    const results = await db.batch([
      db.prepare(`
        INSERT INTO human_invites
          (invite_id, secret_verifier, email, kind, initial_role, status,
           created_by_human_id, created_at, expires_at)
        VALUES (?1, ?2, ?3, 'member', 'member', 'pending', ?4, ?5, ?6)
      `).bind(created.inviteId, created.verifier, email, principal.humanId, nowSeconds, expiresAt),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        VALUES (?1, 'human', ?2, 'human_invite_created', 'invite', ?3,
                json_object('kind', 'member'))
      `).bind(nowSeconds, principal.humanId, created.inviteId),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) {
      return fail("internal_error");
    }
  } catch {
    return fail("internal_error");
  }

  return {
    ok: true,
    value: Object.freeze({
      inviteId: created.inviteId,
      email,
      token: created.token,
      expiresAt,
    }),
  };
}

export async function acceptHumanInvite(
  db: D1DatabaseLike,
  identity: VerifiedHumanIdentity,
  token: string,
  nowSeconds: number,
): Promise<InviteResult<AcceptedHumanInvite>> {
  if (!validTimestamp(nowSeconds)) return fail("validation_error");
  const parsedToken = parseHumanInviteToken(token);
  if (parsedToken === null) return fail("not_found");

  let row: InviteRow | null;
  try {
    row = await db.prepare(`
      SELECT invite_id, secret_verifier, email, kind, initial_role, status, expires_at
      FROM human_invites
      WHERE invite_id = ?1
      LIMIT 1
    `).bind(parsedToken.inviteId).first<InviteRow>();
  } catch {
    return fail("internal_error");
  }

  if (row === null) return fail("not_found");
  const invite = parseInviteRow(row);
  if (invite === null) return fail("internal_error");

  const identityEmail = normalizeInviteEmail(identity.email);
  if (
    identity.provider !== "cloudflare_access" ||
    identityEmail === null ||
    identityEmail !== invite.email ||
    invite.status !== "pending" ||
    invite.expiresAt <= nowSeconds ||
    !(await verifyHumanInviteToken(token, invite.verifier))
  ) {
    return fail("not_found");
  }

  try {
    const existing = await db.prepare(`
      SELECT id
      FROM humans
      WHERE identity_provider = 'cloudflare_access' AND provider_id = ?1
      LIMIT 1
    `).bind(identity.providerId).first<{ readonly id: unknown }>();
    if (existing !== null) return fail("conflict");
  } catch {
    return fail("internal_error");
  }

  const humanId = createAuraId("human");
  const displayName = normalizeDisplayName(identity.displayName);

  try {
    const results = await db.batch([
      db.prepare(`
        INSERT INTO humans
          (id, identity_provider, provider_id, email, display_name, role, status,
           created_at, updated_at, last_seen_at)
        SELECT ?1, 'cloudflare_access', ?2, ?3, ?4, initial_role, 'active', ?5, ?5, ?5
        FROM human_invites
        WHERE invite_id = ?6
          AND secret_verifier = ?7
          AND email = ?3
          AND status = 'pending'
          AND expires_at > ?5
      `).bind(
        humanId,
        identity.providerId,
        identityEmail,
        displayName,
        nowSeconds,
        invite.inviteId,
        invite.verifier,
      ),
      db.prepare(`
        UPDATE human_invites
        SET status = 'accepted', accepted_by_human_id = ?1, accepted_at = ?2
        WHERE invite_id = ?3
          AND secret_verifier = ?4
          AND email = ?5
          AND status = 'pending'
          AND expires_at > ?2
          AND EXISTS (
            SELECT 1 FROM humans
            WHERE id = ?1
              AND identity_provider = 'cloudflare_access'
              AND provider_id = ?6
          )
      `).bind(
        humanId,
        nowSeconds,
        invite.inviteId,
        invite.verifier,
        identityEmail,
        identity.providerId,
      ),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'human_invite_accepted', 'human', ?2,
               json_object('invite_id', invite_id, 'kind', kind)
        FROM human_invites
        WHERE invite_id = ?3
          AND status = 'accepted'
          AND accepted_by_human_id = ?2
          AND accepted_at = ?1
      `).bind(nowSeconds, humanId, invite.inviteId),
    ]);

    if (
      resultChanges(results[0]) !== 1 ||
      resultChanges(results[1]) !== 1 ||
      resultChanges(results[2]) !== 1
    ) {
      return fail("conflict");
    }
  } catch {
    return fail("conflict");
  }

  return {
    ok: true,
    value: Object.freeze({ humanId, role: invite.role }),
  };
}

export async function revokeMemberInvite(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  inviteId: string,
  nowSeconds: number,
): Promise<InviteResult<{ readonly inviteId: string }>> {
  const authorized = authorizeInviteAdministration(principal);
  if (!authorized.ok) return authorized;
  if (!/^[A-Za-z0-9_-]{16}$/.test(inviteId) || !validTimestamp(nowSeconds)) {
    return fail("validation_error");
  }

  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE human_invites
        SET status = 'revoked', revoked_by_human_id = ?1, revoked_at = ?2
        WHERE invite_id = ?3 AND kind = 'member' AND status = 'pending'
      `).bind(principal.humanId, nowSeconds, inviteId),
      db.prepare(`
        INSERT INTO audit_events
          (occurred_at, actor_kind, actor_human_id, action, target_kind, target_id, metadata_json)
        SELECT ?1, 'human', ?2, 'human_invite_revoked', 'invite', invite_id,
               json_object('kind', kind)
        FROM human_invites
        WHERE invite_id = ?3
          AND kind = 'member'
          AND status = 'revoked'
          AND revoked_by_human_id = ?2
          AND revoked_at = ?1
      `).bind(nowSeconds, principal.humanId, inviteId),
    ]);
    if (resultChanges(results[0]) !== 1 || resultChanges(results[1]) !== 1) {
      return fail("conflict");
    }
  } catch {
    return fail("internal_error");
  }

  return { ok: true, value: Object.freeze({ inviteId }) };
}

function parseInviteRow(row: InviteRow): ParsedInviteRow | null {
  if (
    typeof row.invite_id !== "string" ||
    !/^[A-Za-z0-9_-]{16}$/.test(row.invite_id) ||
    typeof row.secret_verifier !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.secret_verifier) ||
    typeof row.email !== "string" ||
    normalizeInviteEmail(row.email) !== row.email ||
    (row.kind !== "member" && row.kind !== "bootstrap_admin") ||
    (row.initial_role !== "member" && row.initial_role !== "admin") ||
    (row.status !== "pending" && row.status !== "accepted" && row.status !== "revoked") ||
    !validTimestamp(row.expires_at)
  ) {
    return null;
  }
  if (
    (row.kind === "member" && row.initial_role !== "member") ||
    (row.kind === "bootstrap_admin" && row.initial_role !== "admin")
  ) {
    return null;
  }
  return {
    inviteId: row.invite_id,
    verifier: row.secret_verifier,
    email: row.email,
    kind: row.kind,
    role: row.initial_role,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

function normalizeDisplayName(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 256 ? trimmed : null;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "forbidden" | "not_found" | "validation_error" | "conflict" | "internal_error") {
  return { ok: false as const, error: domainError(code) };
}
