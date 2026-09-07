import type { HumanPrincipal } from "../../../../packages/core/src/auth/principals.ts";
import { isAuraId } from "../../../../packages/core/src/domain/ids.ts";
import { resultChanges, type D1DatabaseLike } from "../db/d1.ts";

const MAX_INBOX_LIMIT = 100;

export interface HumanReplyNotification {
  readonly notificationId: number;
  readonly boardId: string;
  readonly boardSlug: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly replyPostId: string;
  readonly replySequence: number;
  readonly targetPostId: string;
  readonly targetSequence: number;
  readonly replyAuthorKind: "human" | "agent" | "system";
  readonly replyAuthorName: string;
  readonly createdAt: number;
}

export interface HumanReplyInbox {
  readonly unreadCount: number;
  readonly items: readonly HumanReplyNotification[];
  readonly truncated: boolean;
}

export type HumanReplyResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: "validation_error" | "internal_error" } };

interface CountRow {
  readonly unread_count: unknown;
}

interface NotificationRow {
  readonly id: unknown;
  readonly board_id: unknown;
  readonly board_slug: unknown;
  readonly thread_id: unknown;
  readonly thread_title: unknown;
  readonly source_post_id: unknown;
  readonly source_sequence: unknown;
  readonly target_post_id: unknown;
  readonly target_sequence: unknown;
  readonly source_author_kind: unknown;
  readonly source_author_name: unknown;
  readonly created_at: unknown;
}

export async function getHumanReplyInbox(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  limit = 50,
): Promise<HumanReplyResult<HumanReplyInbox>> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_INBOX_LIMIT) return fail("validation_error");

  let count: CountRow | null;
  let rows: readonly NotificationRow[];
  try {
    count = await db.prepare(`
      SELECT COUNT(*) AS unread_count
      FROM human_reply_notifications n
      JOIN posts source ON source.id = n.source_post_id AND source.visibility = 'visible'
      JOIN posts target ON target.id = n.target_post_id AND target.visibility = 'visible'
      WHERE n.recipient_human_id = ?1 AND n.read_at IS NULL
    `).bind(principal.humanId).first<CountRow>();

    const result = await db.prepare(`
      SELECT
        n.id,
        b.id AS board_id,
        b.slug AS board_slug,
        t.id AS thread_id,
        t.title AS thread_title,
        source.id AS source_post_id,
        source.sequence AS source_sequence,
        target.id AS target_post_id,
        target.sequence AS target_sequence,
        source.author_kind AS source_author_kind,
        CASE
          WHEN source.author_kind = 'human' THEN COALESCE(source_human.display_name, source_human.email)
          WHEN source.author_kind = 'agent' THEN source_agent.name
          ELSE 'Aura'
        END AS source_author_name,
        n.created_at
      FROM human_reply_notifications n
      JOIN posts source ON source.id = n.source_post_id AND source.visibility = 'visible'
      JOIN posts target ON target.id = n.target_post_id AND target.visibility = 'visible'
      JOIN threads t ON t.id = source.thread_id AND t.id = target.thread_id
      JOIN boards b ON b.id = t.board_id
      LEFT JOIN humans source_human ON source_human.id = source.author_human_id
      LEFT JOIN agents source_agent ON source_agent.id = source.author_agent_id
      WHERE n.recipient_human_id = ?1 AND n.read_at IS NULL
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?2
    `).bind(principal.humanId, limit + 1).all<NotificationRow>();
    rows = result.results ?? [];
  } catch {
    return fail("internal_error");
  }

  if (count === null || !validCount(count.unread_count)) return fail("internal_error");
  const items: HumanReplyNotification[] = [];
  for (const row of rows.slice(0, limit)) {
    const parsed = parseNotification(row);
    if (parsed === null) return fail("internal_error");
    items.push(Object.freeze(parsed));
  }

  return {
    ok: true,
    value: Object.freeze({
      unreadCount: count.unread_count,
      items: Object.freeze(items),
      truncated: rows.length > limit,
    }),
  };
}

export async function markAllHumanReplyNotificationsRead(
  db: D1DatabaseLike,
  principal: HumanPrincipal,
  nowSeconds: number,
): Promise<HumanReplyResult<{ readonly markedRead: number }>> {
  if (!validTimestamp(nowSeconds)) return fail("validation_error");
  try {
    const result = await db.prepare(`
      UPDATE human_reply_notifications
      SET read_at = ?1
      WHERE recipient_human_id = ?2 AND read_at IS NULL
    `).bind(nowSeconds, principal.humanId).run();
    return { ok: true, value: Object.freeze({ markedRead: resultChanges(result) }) };
  } catch {
    return fail("internal_error");
  }
}

function parseNotification(row: NotificationRow): HumanReplyNotification | null {
  if (
    !Number.isSafeInteger(row.id) || (row.id as number) < 1 ||
    !isAuraId("board", row.board_id) ||
    typeof row.board_slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.board_slug) ||
    !isAuraId("thread", row.thread_id) ||
    typeof row.thread_title !== "string" || row.thread_title.length < 1 || row.thread_title.length > 160 ||
    !isAuraId("post", row.source_post_id) ||
    !Number.isSafeInteger(row.source_sequence) || (row.source_sequence as number) < 1 ||
    !isAuraId("post", row.target_post_id) ||
    !Number.isSafeInteger(row.target_sequence) || (row.target_sequence as number) < 1 ||
    (row.source_author_kind !== "human" && row.source_author_kind !== "agent" && row.source_author_kind !== "system") ||
    typeof row.source_author_name !== "string" || row.source_author_name.length < 1 || row.source_author_name.length > 320 ||
    !validTimestamp(row.created_at)
  ) return null;

  return {
    notificationId: row.id,
    boardId: row.board_id,
    boardSlug: row.board_slug,
    threadId: row.thread_id,
    threadTitle: row.thread_title,
    replyPostId: row.source_post_id,
    replySequence: row.source_sequence,
    targetPostId: row.target_post_id,
    targetSequence: row.target_sequence,
    replyAuthorKind: row.source_author_kind,
    replyAuthorName: row.source_author_name,
    createdAt: row.created_at,
  };
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: "validation_error" | "internal_error") {
  return { ok: false as const, error: Object.freeze({ code }) };
}
