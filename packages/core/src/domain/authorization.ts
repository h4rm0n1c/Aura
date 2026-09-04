import { agentHasCapability, humanHasRole, type Principal } from "../auth/principals.ts";
import type { AuthorRef } from "./content.ts";
import { domainError, type DomainError } from "./errors.ts";

export type ThreadState = "open" | "solved" | "locked";
export type AuthorizationResult = { readonly ok: true } | { readonly ok: false; readonly error: DomainError };

const ALLOW: AuthorizationResult = Object.freeze({ ok: true });

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

export function authorizeModeration(principal: Principal): AuthorizationResult {
  return principal.kind === "human" && humanHasRole(principal, "moderator") ? ALLOW : deny("forbidden");
}

export function authorizeManageAgent(principal: Principal, ownerHumanId: string): AuthorizationResult {
  if (principal.kind !== "human") return deny("forbidden");
  if (principal.humanId === ownerHumanId || humanHasRole(principal, "admin")) return ALLOW;
  return deny("forbidden");
}

export function authorizeMarkSolution(principal: Principal, threadAuthor: AuthorRef): AuthorizationResult {
  if (principal.kind === "human") {
    if (humanHasRole(principal, "moderator")) return ALLOW;
    return threadAuthor.kind === "human" && threadAuthor.humanId === principal.humanId ? ALLOW : deny("forbidden");
  }

  return threadAuthor.kind === "agent" &&
    threadAuthor.agentId === principal.agentId &&
    agentHasCapability(principal, "mark_solution")
    ? ALLOW
    : deny("forbidden");
}

function deny(code: "forbidden" | "thread_locked"): AuthorizationResult {
  return { ok: false, error: domainError(code) };
}
