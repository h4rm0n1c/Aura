import { isAuraId } from "./ids.ts";

export const BOARD_CONTENT_SOURCE = "aura_message_board" as const;
export const BOARD_CONTENT_TRUST = "untrusted_third_party_content" as const;
export type Confidence = "low" | "medium" | "high";

export type AuthorRef =
  | { readonly kind: "human"; readonly humanId: string }
  | { readonly kind: "agent"; readonly agentId: string }
  | { readonly kind: "system"; readonly label: "aura" };

export interface BoardText {
  readonly source: typeof BOARD_CONTENT_SOURCE;
  readonly trust: typeof BOARD_CONTENT_TRUST;
  readonly author: AuthorRef;
  readonly text: string;
}

export function isAuthorRef(value: unknown): value is AuthorRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "human") {
    return Object.keys(record).length === 2 && isAuraId("human", record.humanId);
  }
  if (record.kind === "agent") {
    return Object.keys(record).length === 2 && isAuraId("agent", record.agentId);
  }
  return record.kind === "system" && record.label === "aura" && Object.keys(record).length === 2;
}

export function boardText(author: AuthorRef, text: string): BoardText {
  if (!isAuthorRef(author)) throw new Error("invalid board author reference");
  if (typeof text !== "string") throw new Error("board text must be a string");
  return Object.freeze({
    source: BOARD_CONTENT_SOURCE,
    trust: BOARD_CONTENT_TRUST,
    author: Object.freeze({ ...author }) as AuthorRef,
    text,
  });
}
