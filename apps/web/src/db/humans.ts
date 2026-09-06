import type { HumanAuthRecord } from "../../../../packages/core/src/auth/principals.ts";
import {
  isBoardStaffRole,
  type BoardStaffRole,
} from "../../../../packages/core/src/domain/authorization.ts";
import type { D1DatabaseLike } from "./d1.ts";

interface HumanRow {
  readonly id: unknown;
  readonly identity_provider: unknown;
  readonly provider_id: unknown;
  readonly role: unknown;
  readonly status: unknown;
}

export async function lookupHumanAuthRecord(
  db: D1DatabaseLike,
  providerId: string,
): Promise<HumanAuthRecord | null> {
  const row = await db.prepare(`
    SELECT id, identity_provider, provider_id, role, status
    FROM humans
    WHERE identity_provider = 'cloudflare_access' AND provider_id = ?1
    LIMIT 1
  `).bind(providerId).first<HumanRow>();

  if (row === null) return null;
  return {
    humanId: typeof row.id === "string" ? row.id : "",
    provider: row.identity_provider === "cloudflare_access" ? "cloudflare_access" : "cloudflare_access",
    providerId: typeof row.provider_id === "string" ? row.provider_id : "",
    role: row.role as HumanAuthRecord["role"],
    status: row.status as HumanAuthRecord["status"],
  };
}

interface BoardStaffRow {
  readonly role: unknown;
}

export async function lookupBoardStaffRole(
  db: D1DatabaseLike,
  humanId: string,
  boardId: string,
): Promise<BoardStaffRole | null> {
  const row = await db.prepare(`
    SELECT role
    FROM board_staff
    WHERE board_id = ?1 AND human_id = ?2
    LIMIT 1
  `).bind(boardId, humanId).first<BoardStaffRow>();

  if (row === null || !isBoardStaffRole(row.role)) return null;
  return row.role;
}
