import { agentHasCapability, humanHasRole, type Principal } from "../auth/principals.ts";
import type { AuthorRef } from "./content.ts";
import { domainError, type DomainError } from "./errors.ts";

export type ThreadState = "open" | "solved" | "locked";
export const BOARD_STAFF_ROLES = ["moderator", "manager"] as const;
export type BoardStaffRole = (typeof BOARD_STAFF_ROLES)[number];
export type AuthorizationResult = { readonly ok: true } | { readonly ok: false; readonly error: DomainError };

const ALLOW: AuthorizationResult = Object.freeze({ ok: true });
const BOARD_STAFF_ROLE_SET = new Set<string>(BOARD_STAFF_ROLES);

export function isBoardStaffRole(value: unknown): value is BoardStaffRole {
  return typeof value === "string" && BOARD_STAFF_ROLE_SET.has(value);
}

export function authorizeBoardRead(principal: Principal): AuthorizationResult {
  if (principal.kind === "human") return ALLOW;
  return agentHasCapability(principal, "read") ? ALLOW : deny("forbidden");
}

export function authorizeBoardPost(principal: Principal): AuthorizationResult {
  if (principal.kind === "human") return ALLOW;
  return agentHasCapability(principal, "post") ? ALLOW : deny("forbidden");
}

export function authorizeThreadReply(principal: Principal, state: ThreadState): AuthorizationResult {
  if (state === "locked") return deny("thread_locked");
  return authorizeBoardPost(principal);
}

/** Site-wide moderation only. Board-local moderation uses authorizeBoardModeration. */
export function authorizeModeration(principal: Principal): AuthorizationResult {
  return principal.kind === "human" && humanHasRole(principal, "moderator") ? ALLOW : deny("forbidden");
}

export function authorizeBoardModeration(
  principal: Principal,
  boardRole: BoardStaffRole | null = null,
): AuthorizationResult {
  if (principal.kind !== "human") return deny("forbidden");
  if (humanHasRole(principal, "moderator")) return ALLOW;
  return boardRole === "moderator" || boardRole === "manager" ? ALLOW : deny("forbidden");
}

/** Edit one board's ordinary metadata. Board managers may do this for their board. */
export function authorizeBoardSettings(
  principal: Principal,
  boardRole: BoardStaffRole | null = null,
): AuthorizationResult {
  if (principal.kind !== "human") return deny("forbidden");
  if (humanHasRole(principal, "admin")) return ALLOW;
  return boardRole === "manager" ? ALLOW : deny("forbidden");
}

/** Create/archive/reorder boards. This remains site-admin authority. */
export function authorizeBoardLifecycle(principal: Principal): AuthorizationResult {
  return siteAdminOnly(principal);
}

/** Create/revoke human invitations. */
export function authorizeInviteAdministration(principal: Principal): AuthorizationResult {
  return siteAdminOnly(principal);
}

/** Disable/re-enable humans and change site roles. */
export function authorizeHumanAdministration(principal: Principal): AuthorizationResult {
  return siteAdminOnly(principal);
}

/**
 * Change staff on one board.
 *
 * Site admins may grant/revoke either board role. A board manager may only
 * create/change/remove moderator-only rows. If manager authority is present
 * on either side of the change, a site administrator is required.
 */
export function authorizeBoardStaffChange(
  principal: Principal,
  actorBoardRole: BoardStaffRole | null,
  currentTargetRole: BoardStaffRole | null,
  nextTargetRole: BoardStaffRole | null,
): AuthorizationResult {
  if (principal.kind !== "human") return deny("forbidden");
  if (humanHasRole(principal, "admin")) return ALLOW;
  if (
    actorBoardRole === "manager" &&
    currentTargetRole !== "manager" &&
    nextTargetRole !== "manager"
  ) {
    return ALLOW;
  }
  return deny("forbidden");
}

/** Create identities or mint/rotate credentials. Only the owning human may do this. */
export function authorizeAgentProvisioning(principal: Principal, ownerHumanId: string): AuthorizationResult {
  if (principal.kind !== "human") return deny("forbidden");
  return principal.humanId === ownerHumanId ? ALLOW : deny("forbidden");
}

/** Disable/re-enable an agent or revoke a credential. Owner or site admin. */
export function authorizeAgentOperationalControl(principal: Principal, ownerHumanId: string): AuthorizationResult {
  if (principal.kind !== "human") return deny("forbidden");
  if (principal.humanId === ownerHumanId || humanHasRole(principal, "admin")) return ALLOW;
  return deny("forbidden");
}

/** Backwards-compatible alias for operational control. Prefer the narrower functions above. */
export function authorizeManageAgent(principal: Principal, ownerHumanId: string): AuthorizationResult {
  return authorizeAgentOperationalControl(principal, ownerHumanId);
}

export function authorizeMarkSolution(
  principal: Principal,
  threadAuthor: AuthorRef,
  boardRole: BoardStaffRole | null = null,
): AuthorizationResult {
  if (principal.kind === "human") {
    if (authorizeBoardModeration(principal, boardRole).ok) return ALLOW;
    return threadAuthor.kind === "human" && threadAuthor.humanId === principal.humanId ? ALLOW : deny("forbidden");
  }

  return threadAuthor.kind === "agent" &&
    threadAuthor.agentId === principal.agentId &&
    agentHasCapability(principal, "mark_solution")
    ? ALLOW
    : deny("forbidden");
}

function siteAdminOnly(principal: Principal): AuthorizationResult {
  return principal.kind === "human" && humanHasRole(principal, "admin") ? ALLOW : deny("forbidden");
}

function deny(code: "forbidden" | "thread_locked"): AuthorizationResult {
  return { ok: false, error: domainError(code) };
}
