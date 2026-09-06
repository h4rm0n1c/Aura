import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { HumanPrincipal, HumanRole } from "../../../packages/core/src/auth/principals.ts";
import {
  createHumanReply,
  createHumanThread,
  getForumBoard,
  getForumThread,
  listForumBoards,
} from "../src/forum/service.ts";
import { handleForumRequest } from "../src/forum/routes.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";

const migration1 = readFileSync(new URL("../../../db/migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../../../db/migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const migration3 = readFileSync(new URL("../../../db/migrations/0003_unbound_member_invites.sql", import.meta.url), "utf8");

const ADMIN = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const MEMBER = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const BOARD = "brd_CCCCCCCCCCCCCCCCCCCCCC";
const ARCHIVED_BOARD = "brd_DDDDDDDDDDDDDDDDDDDDDD";
const AGENT = "agt_EEEEEEEEEEEEEEEEEEEEEE";

class StatementAdapter implements D1PreparedStatementLike {
  readonly database: DatabaseSync;
  readonly query: string;
  values: readonly unknown[] = [];

  constructor(database: DatabaseSync, query: string) {
    this.database = database;
    this.query = query;
  }

  bind(...values: readonly unknown[]): D1PreparedStatementLike {
    const next = new StatementAdapter(this.database, this.query);
    next.values = values;
    return next;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.database.prepare(this.query).get(...this.values);
    return row === undefined ? null : { ...row } as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    const rows = this.database.prepare(this.query).all(...this.values);
    return { results: rows.map((row) => ({ ...row })) as T[] };
  }

  async run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    return this.runSync() as D1ResultLike<T>;
  }

  runSync(): D1ResultLike {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class DatabaseAdapter implements D1DatabaseLike {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.sqlite.exec(migration1);
    this.sqlite.exec(migration2);
    this.sqlite.exec(migration3);
  }

  prepare(query: string): D1PreparedStatementLike {
    return new StatementAdapter(this.sqlite, query);
  }

  async batch(statements: readonly D1PreparedStatementLike[]): Promise<readonly D1ResultLike[]> {
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof StatementAdapter)) throw new Error("unexpected statement adapter");
        return statement.runSync();
      });
      this.sqlite.exec("COMMIT;");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}

function seedHuman(
  db: DatabaseAdapter,
  id: string,
  providerId: string,
  role: HumanRole = "member",
  displayName: string | null = providerId,
): HumanPrincipal {
  const email = `${providerId}@example.test`;
  db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, ?, ?, 'active', 1, 1)`)
    .run(id, providerId, email, displayName, role);
  return { kind: "human", humanId: id, role, email, displayName };
}

function seedBoards(db: DatabaseAdapter): void {
  db.sqlite.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order)
    VALUES (?, 'general', 'General', 'General discussion', 1, 'active', 10)`)
    .run(BOARD);
  db.sqlite.prepare(`INSERT INTO boards
    (id, slug, title, description, created_at, status, sort_order)
    VALUES (?, 'old', 'Old', 'Archived', 1, 'archived', 20)`)
    .run(ARCHIVED_BOARD);
}

async function createThread(db: DatabaseAdapter, principal: HumanPrincipal, title = "First thread", body = "Hello Aura") {
  const created = await createHumanThread(db, principal, { boardId: BOARD, title, body }, 100);
  assert(created.ok);
  if (!created.ok) throw new Error("thread creation failed");
  return created.value;
}

test("forum board index exposes active boards with useful thread counts", async () => {
  const db = new DatabaseAdapter();
  const member = seedHuman(db, MEMBER, "member");
  seedBoards(db);
  await createThread(db, member);

  const boards = await listForumBoards(db, member);
  assert.equal(boards.ok, true);
  if (!boards.ok) return db.close();
  assert.equal(boards.value.length, 1);
  assert.equal(boards.value[0].slug, "general");
  assert.equal(boards.value[0].threadCount, 1);
  assert.equal(boards.value[0].openThreadCount, 1);

  const page = await getForumBoard(db, member, "general");
  assert.equal(page.ok, true);
  if (page.ok) assert.equal(page.value.threads[0].author.displayName, "member");
  const archived = await getForumBoard(db, member, "old");
  assert.equal(archived.ok, false);
  if (!archived.ok) assert.equal(archived.error.code, "not_found");
  db.close();
});

test("human creates a thread and durable parented reply", async () => {
  const db = new DatabaseAdapter();
  const member = seedHuman(db, MEMBER, "member", "member", "Human User");
  seedBoards(db);
  const created = await createThread(db, member, "Need a hand", "Initial problem");

  const reply = await createHumanReply(db, member, {
    threadId: created.threadId,
    body: "Follow-up information",
    parentPostId: created.postId,
  }, 101);
  assert.equal(reply.ok, true);

  const thread = await getForumThread(db, member, created.threadId);
  assert.equal(thread.ok, true);
  if (!thread.ok) return db.close();
  assert.equal(thread.value.posts.length, 2);
  assert.equal(thread.value.posts[0].sequence, 1);
  assert.equal(thread.value.posts[1].sequence, 2);
  assert.equal(thread.value.posts[1].parentPostId, created.postId);
  assert.equal(thread.value.posts[1].author.displayName, "Human User");
  assert.equal(thread.value.thread.replyCount, 1);
  db.close();
});

test("locked threads reject human replies", async () => {
  const db = new DatabaseAdapter();
  const member = seedHuman(db, MEMBER, "member");
  seedBoards(db);
  const created = await createThread(db, member);
  db.sqlite.prepare("UPDATE threads SET state='locked' WHERE id=?").run(created.threadId);

  const reply = await createHumanReply(db, member, { threadId: created.threadId, body: "Nope" }, 102);
  assert.equal(reply.ok, false);
  if (!reply.ok) assert.equal(reply.error.code, "thread_locked");
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM posts WHERE thread_id=?").get(created.threadId) as { n: number }).n, 1);
  db.close();
});

test("thread HTML escapes board content, shows staff capcodes, links references and shows agent provenance", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin", "Site Admin");
  const member = seedHuman(db, MEMBER, "member", "member", "Board Mod");
  seedBoards(db);
  db.sqlite.prepare(`INSERT INTO board_staff
    (board_id, human_id, role, granted_by_human_id, created_at)
    VALUES (?, ?, 'moderator', ?, 2)`)
    .run(BOARD, MEMBER, ADMIN);
  const created = await createThread(db, admin, "<script>alert(1)</script>", "<img src=x onerror=alert(1)>");
  const modReply = await createHumanReply(db, member, {
    threadId: created.threadId,
    body: ">>1\nBoard moderator reply",
    parentPostId: created.postId,
  }, 101);
  assert.equal(modReply.ok, true);

  db.sqlite.prepare(`INSERT INTO agents
    (id, owner_human_id, name, model, client, status, created_at, updated_at)
    VALUES (?, ?, 'Helper Agent', 'Model X', 'Client Y', 'active', 1, 1)`)
    .run(AGENT, MEMBER);
  const agentPost = "pst_FFFFFFFFFFFFFFFFFFFFFF";
  db.sqlite.prepare(`INSERT INTO posts
    (id, thread_id, sequence, author_kind, author_agent_id, body, visibility, created_at)
    VALUES (?, ?, 3, 'agent', ?, 'Agent answer', 'visible', 102)`)
    .run(agentPost, created.threadId, AGENT);
  db.sqlite.prepare("UPDATE threads SET updated_at=102 WHERE id=?").run(created.threadId);

  const response = await handleForumRequest(
    new Request(`https://aura.example/t/${created.threadId}`),
    db,
    new Uint8Array(32).fill(7),
    member,
    new URL(`https://aura.example/t/${created.threadId}`),
  );
  assert(response);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /## Admin/);
  assert.match(html, /## Board Mod/);
  assert.match(html, /AGENT/);
  assert.match(html, /Helper Agent/);
  assert.match(html, /model Model X · client Client Y/);
  assert.match(html, /class="post-number"[^>]*>No\.1<\/a>/);
  assert.match(html, new RegExp(`class="post-ref" href="#p-${created.postId}">&gt;&gt;1</a>`));
  assert.doesNotMatch(html, /class="post-foot"/);
  assert.match(html, new RegExp(`reply-to/${agentPost}`));
  db.close();
});

test("forum HTML forms create a thread and reply with CSRF and PRG redirects", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin", "Admin User");
  seedBoards(db);
  const csrfKey = new Uint8Array(32).fill(11);

  const boardGet = await handleForumRequest(
    new Request("https://aura.example/b/general"),
    db,
    csrfKey,
    admin,
    new URL("https://aura.example/b/general"),
  );
  assert(boardGet);
  assert.equal(boardGet.status, 200);
  const boardHtml = await boardGet.text();
  assert.match(boardHtml, /Start a thread/);
  assert.match(boardHtml, /href="#new-thread">Start thread<\/a>/);
  assert.match(boardHtml, /class="board-strip"/);
  assert.match(boardHtml, /href="\/b\/general"[^>]*>\/general\/<\/a>/);
  const createCsrf = /name="csrf" value="([^"]+)"/.exec(boardHtml)?.[1];
  assert(createCsrf);

  const createPost = await handleForumRequest(
    new Request("https://aura.example/b/general/threads", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://aura.example" },
      body: new URLSearchParams({ csrf: createCsrf, title: "Web-created thread", body: "First post" }).toString(),
    }),
    db,
    csrfKey,
    admin,
    new URL("https://aura.example/b/general/threads"),
  );
  assert(createPost);
  assert.equal(createPost.status, 303);
  const location = createPost.headers.get("location") ?? "";
  assert.match(location, /^\/t\/thr_[A-Za-z0-9_-]{22}#p-pst_[A-Za-z0-9_-]{22}$/);
  const threadId = /^\/t\/(thr_[A-Za-z0-9_-]{22})/.exec(location)?.[1];
  const firstPostId = /#p-(pst_[A-Za-z0-9_-]{22})$/.exec(location)?.[1];
  assert(threadId);
  assert(firstPostId);

  const threadGet = await handleForumRequest(
    new Request(`https://aura.example/t/${threadId}`),
    db,
    csrfKey,
    admin,
    new URL(`https://aura.example/t/${threadId}`),
  );
  assert(threadGet);
  const threadHtml = await threadGet.text();
  const replyCsrf = /<form method="post" action="\/t\/[^\"]+\/reply">\s*<input type="hidden" name="csrf" value="([^"]+)"/.exec(threadHtml)?.[1];
  assert(replyCsrf);

  const targetedGet = await handleForumRequest(
    new Request(`https://aura.example/t/${threadId}/reply-to/${firstPostId}`),
    db,
    csrfKey,
    admin,
    new URL(`https://aura.example/t/${threadId}/reply-to/${firstPostId}`),
  );
  assert(targetedGet);
  assert.equal(targetedGet.status, 200);
  const targetedHtml = await targetedGet.text();
  assert.match(targetedHtml, /Replying to &gt;&gt;1/);
  assert.match(targetedHtml, /<textarea id="reply-body" name="body" rows="8" required>&gt;&gt;1\n<\/textarea>/);
  assert.equal((targetedHtml.match(/name="parent_post_id"/g) ?? []).length, 1);

  const replyPost = await handleForumRequest(
    new Request(`https://aura.example/t/${threadId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://aura.example" },
      body: new URLSearchParams({ csrf: replyCsrf, body: "Second post" }).toString(),
    }),
    db,
    csrfKey,
    admin,
    new URL(`https://aura.example/t/${threadId}/reply`),
  );
  assert(replyPost);
  assert.equal(replyPost.status, 303);
  assert.match(replyPost.headers.get("location") ?? "", new RegExp(`^/t/${threadId}#p-pst_`));
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM posts WHERE thread_id=?").get(threadId) as { n: number }).n, 2);
  db.close();
});
