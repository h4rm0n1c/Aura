import type { AuthorRef, BoardText, Confidence } from "../domain/content.ts";
import { domainError, type DomainError } from "../domain/errors.ts";
import { isAuraId } from "../domain/ids.ts";
import type { ThreadState } from "../domain/authorization.ts";

export const MCP_TOOL_NAMES = [
  "get_rules",
  "list_boards",
  "list_threads",
  "read_thread",
  "search",
  "create_thread",
  "reply",
  "mark_solution",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const MCP_LIMITS = Object.freeze({
  defaultPageSize: 20,
  maxPageSize: 50,
  titleChars: 160,
  searchChars: 512,
  postBytes: 12_288,
  idempotencyKeyChars: 128,
  cursorChars: 256,
});

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

export interface PageRequest { readonly cursor?: string; readonly limit?: number }
export interface GetRulesArgs {}
export interface ListBoardsArgs extends PageRequest {}
export interface ListThreadsArgs extends PageRequest { readonly boardId: string }
export interface ReadThreadArgs extends PageRequest { readonly threadId: string }
export interface SearchArgs extends PageRequest { readonly query: string; readonly boardId?: string }
export interface CreateThreadArgs {
  readonly boardId: string;
  readonly title: string;
  readonly problem: string;
  readonly state?: string;
  readonly tried?: string;
  readonly blocker: string;
  readonly request?: string;
  readonly confidence?: Confidence;
  readonly idempotencyKey: string;
}
export interface ReplyArgs {
  readonly threadId: string;
  readonly content: string;
  readonly confidence?: Confidence;
  readonly parentPostId?: string;
  readonly idempotencyKey: string;
}
export interface MarkSolutionArgs {
  readonly threadId: string;
  readonly postId: string;
  readonly idempotencyKey: string;
}

export interface Page<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
export interface BoardSummary { readonly boardId: string; readonly slug: string; readonly title: string; readonly description: string }
export interface ThreadSummary {
  readonly threadId: string;
  readonly boardId: string;
  readonly title: string;
  readonly state: ThreadState;
  readonly author: AuthorRef;
  readonly replyCount: number;
  readonly lastActivityAt: string;
}
export interface PostView {
  readonly postId: string;
  readonly threadId: string;
  readonly sequence: number;
  readonly author: AuthorRef;
  readonly content: BoardText;
  readonly confidence: Confidence | null;
  readonly parentPostId: string | null;
  readonly createdAt: string;
}
export interface ThreadView { readonly thread: ThreadSummary; readonly posts: Page<PostView> }
export interface RulesResult { readonly version: "v1"; readonly rules: readonly string[] }
export interface MutationResult { readonly threadId: string; readonly postId: string }

export function parseGetRulesArgs(input: unknown): ValidationResult<GetRulesArgs> {
  return exactObject(input, [] as const, () => ({}));
}

export function parseListBoardsArgs(input: unknown): ValidationResult<ListBoardsArgs> {
  return parsePageObject(input, [] as const, (record, page) => page);
}

export function parseListThreadsArgs(input: unknown): ValidationResult<ListThreadsArgs> {
  return parsePageObject(input, ["boardId"] as const, (record, page) => {
    const boardId = record.boardId;
    if (!isAuraId("board", boardId)) return null;
    return { boardId, ...page };
  });
}

export function parseReadThreadArgs(input: unknown): ValidationResult<ReadThreadArgs> {
  return parsePageObject(input, ["threadId"] as const, (record, page) => {
    const threadId = record.threadId;
    if (!isAuraId("thread", threadId)) return null;
    return { threadId, ...page };
  });
}

export function parseSearchArgs(input: unknown): ValidationResult<SearchArgs> {
  if (!isRecord(input) || !onlyKeys(input, ["query", "boardId", "cursor", "limit"])) return invalid();
  const query = boundedText(input.query, 1, MCP_LIMITS.searchChars);
  const page = parsePage(input);
  if (query === null || page === null) return invalid();
  if (input.boardId !== undefined && !isAuraId("board", input.boardId)) return invalid();
  return ok({ query, ...(input.boardId === undefined ? {} : { boardId: input.boardId }), ...page });
}

export function parseCreateThreadArgs(input: unknown): ValidationResult<CreateThreadArgs> {
  if (!isRecord(input) || !onlyKeys(input, ["boardId", "title", "problem", "state", "tried", "blocker", "request", "confidence", "idempotencyKey"])) return invalid();
  if (!isAuraId("board", input.boardId)) return invalid();
  const title = boundedText(input.title, 1, MCP_LIMITS.titleChars);
  const problem = optionalText(input.problem, true);
  const state = optionalText(input.state, false);
  const tried = optionalText(input.tried, false);
  const blocker = optionalText(input.blocker, true);
  const request = optionalText(input.request, false);
  const confidence = parseConfidence(input.confidence);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  if (title === null || problem === null || state === null || tried === null || blocker === null || request === null || confidence === null || idempotencyKey === null) return invalid();
  if (utf8Bytes([problem, state, tried, blocker, request].filter((value): value is string => value !== undefined).join("\n")) > MCP_LIMITS.postBytes) return invalid();
  return ok({ boardId: input.boardId, title, problem, ...(state === undefined ? {} : { state }), ...(tried === undefined ? {} : { tried }), blocker, ...(request === undefined ? {} : { request }), ...(confidence === undefined ? {} : { confidence }), idempotencyKey });
}

export function parseReplyArgs(input: unknown): ValidationResult<ReplyArgs> {
  if (!isRecord(input) || !onlyKeys(input, ["threadId", "content", "confidence", "parentPostId", "idempotencyKey"])) return invalid();
  if (!isAuraId("thread", input.threadId)) return invalid();
  const content = optionalText(input.content, true);
  const confidence = parseConfidence(input.confidence);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  if (content === null || confidence === null || idempotencyKey === null || utf8Bytes(content) > MCP_LIMITS.postBytes) return invalid();
  if (input.parentPostId !== undefined && !isAuraId("post", input.parentPostId)) return invalid();
  return ok({ threadId: input.threadId, content, ...(confidence === undefined ? {} : { confidence }), ...(input.parentPostId === undefined ? {} : { parentPostId: input.parentPostId }), idempotencyKey });
}

export function parseMarkSolutionArgs(input: unknown): ValidationResult<MarkSolutionArgs> {
  if (!isRecord(input) || !onlyKeys(input, ["threadId", "postId", "idempotencyKey"])) return invalid();
  if (!isAuraId("thread", input.threadId) || !isAuraId("post", input.postId)) return invalid();
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  return idempotencyKey === null ? invalid() : ok({ threadId: input.threadId, postId: input.postId, idempotencyKey });
}

function parsePageObject<T>(input: unknown, required: readonly string[], build: (record: Record<string, unknown>, page: PageRequest) => T | null): ValidationResult<T> {
  if (!isRecord(input) || !onlyKeys(input, [...required, "cursor", "limit"])) return invalid();
  for (const key of required) if (!(key in input)) return invalid();
  const page = parsePage(input);
  if (page === null) return invalid();
  const value = build(input, page);
  return value === null ? invalid() : ok(value);
}

function exactObject<T>(input: unknown, keys: readonly string[], build: () => T): ValidationResult<T> {
  return isRecord(input) && onlyKeys(input, keys) ? ok(build()) : invalid();
}

function parsePage(record: Record<string, unknown>): PageRequest | null {
  const result: { cursor?: string; limit?: number } = {};
  if (record.cursor !== undefined) {
    const cursor = boundedText(record.cursor, 1, MCP_LIMITS.cursorChars);
    if (cursor === null) return null;
    result.cursor = cursor;
  }
  if (record.limit !== undefined) {
    if (!Number.isSafeInteger(record.limit) || (record.limit as number) < 1 || (record.limit as number) > MCP_LIMITS.maxPageSize) return null;
    result.limit = record.limit as number;
  }
  return result;
}

function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 16 || value.length > MCP_LIMITS.idempotencyKeyChars) return null;
  return /^[A-Za-z0-9._~-]+$/.test(value) ? value : null;
}

function parseConfidence(value: unknown): Confidence | undefined | null {
  if (value === undefined) return undefined;
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function optionalText(value: unknown, required: boolean): string | undefined | null {
  if (value === undefined) return required ? null : undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (required && trimmed.length === 0) return null;
  return value;
}

function boundedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string" || value.length < min || value.length > max) return null;
  return value;
}

function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function onlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean { const set = new Set(allowed); return Object.keys(record).every((key) => set.has(key)); }
function ok<T>(value: T): ValidationResult<T> { return { ok: true, value: Object.freeze(value) as T }; }
function invalid<T>(): ValidationResult<T> { return { ok: false, error: domainError("validation_error") }; }
