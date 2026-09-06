import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import type { HumanPrincipal, HumanRole } from "../../../packages/core/src/auth/principals.ts";
import {
  createBoard,
  getBoardForManagement,
  getBoardStaffPageData,
  listBoardsForAdmin,
  setBoardStaffRole,
  setBoardStatus,
  updateBoardMetadata,
} from "../src/admin/boards.ts";
import { handleAdminRequest } from "../src/admin/routes.ts";
import type { D1DatabaseLike, D1PreparedStatementLike, D1ResultLike } from "../src/db/d1.ts";

const migration1 = readFileSync(new URL("../../../db/migrations/0001_initial.sql", import.meta.url), "utf8");
const migration2 = readFileSync(new URL("../../../db/migrations/0002_human_membership_and_board_staff.sql", import.meta.url), "utf8");
const migration3 = readFileSync(new URL("../../../db/migrations/0003_unbound_member_invites.sql", import.meta.url), "utf8");

const ADMIN = "hum_AAAAAAAAAAAAAAAAAAAAAA";
const MANAGER = "hum_BBBBBBBBBBBBBBBBBBBBBB";
const MODERATOR = "hum_CCCCCCCCCCCCCCCCCCCCCC";
const MEMBER = "hum_DDDDDDDDDDDDDDDDDDDDDD";

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
  status: "active" | "disabled" = "active",
): HumanPrincipal {
  db.sqlite.prepare(`INSERT INTO humans
    (id, identity_provider, provider_id, email, display_name, role, status, created_at, updated_at)
    VALUES (?, 'cloudflare_access', ?, ?, ?, ?, ?, 1, 1)`)
    .run(id, providerId, `${providerId}@example.test`, providerId, role, status);
  return {
    kind: "human",
    humanId: id,
    role,
    email: `${providerId}@example.test`,
    displayName: providerId,
  };
}

async function seededBoard(db: DatabaseAdapter, admin: HumanPrincipal): Promise<string> {
  const created = await createBoard(db, admin, {
    slug: "general",
    title: "General",
    description: "General coordination",
  }, 10);
  assert(created.ok);
  if (!created.ok) throw new Error("board create failed");
  return created.value.boardId;
}

test("site admin creates, lists, and archives boards while ordinary members cannot", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin");
  const member = seedHuman(db, MEMBER, "member");

  const denied = await createBoard(db, member, { slug: "nope", title: "Nope", description: "" }, 10);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "forbidden");

  const boardId = await seededBoard(db, admin);
  const duplicate = await createBoard(db, admin, { slug: "general", title: "Duplicate", description: "" }, 11);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.code, "conflict");

  const listed = await listBoardsForAdmin(db, admin);
  assert.equal(listed.ok, true);
  if (!listed.ok) return db.close();
  assert.equal(listed.value.length, 1);
  assert.equal(listed.value[0].boardId, boardId);
  assert.equal(listed.value[0].slug, "general");
  assert.equal(listed.value[0].status, "active");
  assert.equal(listed.value[0].sortOrder, 0);

  const archived = await setBoardStatus(db, admin, boardId, "archived", 12);
  assert.deepEqual(archived, { ok: true, value: { boardId, status: "archived" } });
  assert.equal((db.sqlite.prepare("SELECT status FROM boards WHERE id=?").get(boardId) as { status: string }).status, "archived");
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE action='board_created'").get() as { n: number }).n, 1);
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE action='board_status_changed'").get() as { n: number }).n, 1);
  db.close();
});

test("board manager edits metadata but cannot change board lifecycle", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin");
  const manager = seedHuman(db, MANAGER, "manager");
  const boardId = await seededBoard(db, admin);
  const granted = await setBoardStaffRole(db, admin, boardId, MANAGER, "manager", 11);
  assert.equal(granted.ok, true);

  const managed = await getBoardForManagement(db, manager, boardId);
  assert.equal(managed.ok, true);
  if (!managed.ok) return db.close();
  assert.equal(managed.value.actorBoardRole, "manager");

  const edited = await updateBoardMetadata(db, manager, boardId, {
    title: "General work",
    description: "Updated by board manager",
  }, 12);
  assert.equal(edited.ok, true);
  const stored = db.sqlite.prepare("SELECT title, description FROM boards WHERE id=?").get(boardId) as { title: string; description: string };
  assert.deepEqual({ ...stored }, { title: "General work", description: "Updated by board manager" });

  const lifecycle = await setBoardStatus(db, manager, boardId, "archived", 13);
  assert.equal(lifecycle.ok, false);
  if (!lifecycle.ok) assert.equal(lifecycle.error.code, "forbidden");
  db.close();
});

test("board managers manage moderators but manager authority remains site-admin-only", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin");
  const manager = seedHuman(db, MANAGER, "manager");
  seedHuman(db, MODERATOR, "moderator");
  seedHuman(db, MEMBER, "disabled-member", "member", "disabled");
  const boardId = await seededBoard(db, admin);

  assert.equal((await setBoardStaffRole(db, admin, boardId, MANAGER, "manager", 11)).ok, true);
  assert.equal((await setBoardStaffRole(db, manager, boardId, MODERATOR, "moderator", 12)).ok, true);

  const promote = await setBoardStaffRole(db, manager, boardId, MODERATOR, "manager", 13);
  assert.equal(promote.ok, false);
  if (!promote.ok) assert.equal(promote.error.code, "forbidden");

  const touchManager = await setBoardStaffRole(db, manager, boardId, MANAGER, null, 14);
  assert.equal(touchManager.ok, false);
  if (!touchManager.ok) assert.equal(touchManager.error.code, "forbidden");

  const disabledTarget = await setBoardStaffRole(db, admin, boardId, MEMBER, "moderator", 15);
  assert.equal(disabledTarget.ok, false);
  if (!disabledTarget.ok) assert.equal(disabledTarget.error.code, "conflict");

  const data = await getBoardStaffPageData(db, manager, boardId);
  assert.equal(data.ok, true);
  if (!data.ok) return db.close();
  assert.equal(data.value.people.find((person) => person.humanId === MANAGER)?.boardRole, "manager");
  assert.equal(data.value.people.find((person) => person.humanId === MODERATOR)?.boardRole, "moderator");

  assert.equal((await setBoardStaffRole(db, admin, boardId, MANAGER, null, 16)).ok, true);
  db.close();
});

test("board-specific admin routes admit managers without granting the site admin surface", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin");
  const manager = seedHuman(db, MANAGER, "manager");
  const boardId = await seededBoard(db, admin);
  assert.equal((await setBoardStaffRole(db, admin, boardId, MANAGER, "manager", 11)).ok, true);
  const csrfKey = new Uint8Array(32).fill(31);

  const boardPage = await handleAdminRequest(
    new Request(`https://aura.example/admin/boards/${boardId}`),
    db,
    csrfKey,
    manager,
    new URL(`https://aura.example/admin/boards/${boardId}`),
  );
  assert(boardPage);
  assert.equal(boardPage.status, 200);
  assert.match(await boardPage.text(), /Save board metadata/);

  const staffPage = await handleAdminRequest(
    new Request(`https://aura.example/admin/boards/${boardId}/staff`),
    db,
    csrfKey,
    manager,
    new URL(`https://aura.example/admin/boards/${boardId}/staff`),
  );
  assert(staffPage);
  assert.equal(staffPage.status, 200);
  assert.match(await staffPage.text(), /site administrators may grant, change, or remove board-manager authority/i);

  const siteBoards = await handleAdminRequest(
    new Request("https://aura.example/admin/boards"),
    db,
    csrfKey,
    manager,
    new URL("https://aura.example/admin/boards"),
  );
  assert(siteBoards);
  assert.equal(siteBoards.status, 403);
  db.close();
});

test("admin board route creates a board through the CSRF-protected HTML form", async () => {
  const db = new DatabaseAdapter();
  const admin = seedHuman(db, ADMIN, "admin", "admin");
  const csrfKey = new Uint8Array(32).fill(37);

  const get = await handleAdminRequest(
    new Request("https://aura.example/admin/boards"),
    db,
    csrfKey,
    admin,
    new URL("https://aura.example/admin/boards"),
  );
  assert(get);
  assert.equal(get.status, 200);
  const html = await get.text();
  assert.match(html, /Create board/);
  const token = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert(token);

  const post = await handleAdminRequest(
    new Request("https://aura.example/admin/boards", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://aura.example",
      },
      body: new URLSearchParams({
        csrf: token,
        slug: "project-help",
        title: "Project help",
        description: "Ask for help with permitted projects.",
      }).toString(),
    }),
    db,
    csrfKey,
    admin,
    new URL("https://aura.example/admin/boards"),
  );
  assert(post);
  assert.equal(post.status, 303);
  assert.match(post.headers.get("location") ?? "", /^\/admin\/boards\/brd_/);
  assert.equal((db.sqlite.prepare("SELECT count(*) AS n FROM boards WHERE slug='project-help'").get() as { n: number }).n, 1);
  db.close();
});