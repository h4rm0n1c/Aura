import type { HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import { authorizeInviteAdministration } from "../../../../packages/core/src/domain/authorization.ts";
import { domainError, type DomainError } from "../../../../packages/core/src/domain/errors.ts";
import type { D1DatabaseLike } from "../db/d1.ts";

export type HumanInviteState = "pending" | "expired" | "accepted" | "revoked";

export interface HumanInviteAdminSummary {
  readonly inviteId: string;
  readonly email: string | null;
  readonly binding: "email" | "link";
  readonly kind: "member" | "bootstrap_admin";
  readonly initialRole: "member" | "admin";
  readonly state: HumanInviteState;
  readonly createdByHumanId: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly acceptedByHumanId: string | null;
  readonly acceptedAt: number | null;
  readonly revokedByHumanId: string | null;
  readonly revokedAt: number | null;
}

export type InviteAdminResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

interface InviteAdminRow {
  readonly invite_id: unknown;
  readonly email: unknown;
  readonly kind: unknown;
  readonly initial_role: unknown;
  readonly status: unknown;
  readonly created_by_human_id: unknown;
  readonly created_at: unknown;
  readonly expires_at: unknown;
  readonly accepted_by_human_id: unknown;
  readonly accepted_at: unknown;
  readonly revoked_by_human_id: unknown;
  readonly revoked_at: unknown;
}

export async function listHumanInvitesForAdmin(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  nowSeconds: number,
): Promise<InviteAdminResult<readonly HumanInviteAdminSummary[]>> {
  const authorized = authorizeInviteAdministration(principal);
  if (!authorized.ok) return authorized;
  if (!validTimestamp(nowSeconds)) return fail("validation_error");

  let rows: readonly InviteAdminRow[];
  try {
    const result = await db.prepare(`
      SELECT
        invite_id,
        email,
        kind,
        initial_role,
        status,
        created_by_human_id,
        created_at,
        expires_at,
        accepted_by_human_id,
        accepted_at,
        revoked_by_human_id,
        revoked_at
      FROM human_invites
      ORDER BY created_at DESC, invite_id DESC
    `).all<InviteAdminRow>();
    rows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  const output: HumanInviteAdminSummary[] = [];
  for (const row of rows) {
    const parsed = parseInvite(row, nowSeconds);
    if (parsed === null) return fail("internal_error");
    output.push(Object.freeze(parsed));
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseInvite(row: InviteAdminRow, nowSeconds: number): HumanInviteAdminSummary | null {
  const email = row.email === null
    ? null
    : typeof row.email === "string" && row.email.length >= 3 && row.email.length <= 320 && row.email === row.email.toLowerCase()
      ? row.email
      : undefined;

  if (
    typeof row.invite_id !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(row.invite_id) ||
    email === undefined ||
    (row.kind !== "member" && row.kind !== "bootstrap_admin") ||
    (row.initial_role !== "member" && row.initial_role !== "admin") ||
    (row.status !== "pending" && row.status !== "accepted" && row.status !== "revoked") ||
    !nullableHumanId(row.created_by_human_id) ||
    !validTimestamp(row.created_at) ||
    !validTimestamp(row.expires_at) ||
    !nullableHumanId(row.accepted_by_human_id) ||
    !nullableTimestamp(row.accepted_at) ||
    !nullableHumanId(row.revoked_by_human_id) ||
    !nullableTimestamp(row.revoked_at) ||
    (row.kind === "member" && row.initial_role !== "member") ||
    (row.kind === "bootstrap_admin" && (row.initial_role !== "admin" || email === null))
  ) {
    return null;
  }

  const state: HumanInviteState = row.status === "pending" && row.expires_at <= nowSeconds
    ? "expired"
    : row.status;

  return {
    inviteId: row.invite_id,
    email,
    binding: email === null ? "link" : "email",
    kind: row.kind,
    initialRole: row.initial_role,
    state,
    createdByHumanId: row.created_by_human_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedByHumanId: row.accepted_by_human_id,
    acceptedAt: row.accepted_at,
    revokedByHumanId: row.revoked_by_human_id,
    revokedAt: row.revoked_at,
  };
}

function nullableHumanId(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^hum_[A-Za-z0-9_-]{22}$/.test(value));
}

function nullableTimestamp(value: unknown): value is number | null {
  return value === null || validTimestamp(value);
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "forbidden" | "validation_error" | "internal_error") {
  return { ok: false as const, error: domainError(code) };
}
