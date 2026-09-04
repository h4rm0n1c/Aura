export const DOMAIN_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation_error",
  "rate_limited",
  "conflict",
  "thread_locked",
  "idempotency_conflict",
  "internal_error",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly retryAfterSeconds?: number;
}

export function domainError(code: DomainErrorCode, retryAfterSeconds?: number): DomainError {
  if (retryAfterSeconds === undefined) return Object.freeze({ code });
  if (!Number.isSafeInteger(retryAfterSeconds) || retryAfterSeconds < 0) {
    throw new Error("retryAfterSeconds must be a non-negative integer");
  }
  return Object.freeze({ code, retryAfterSeconds });
}
