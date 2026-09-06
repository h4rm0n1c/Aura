import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeBoardLifecycle,
  authorizeBoardModeration,
  authorizeBoardPost,
  authorizeBoardRead,
  authorizeBoardSettings,
  authorizeBoardStaffChange,
  authorizeHumanAdministration,
  authorizeInviteAdministration,
  authorizeManageAgent,
  authorizeMarkSolution,
  authorizeModeration,
  authorizeThreadReply,
  isBoardStaffRole,
} from "../src/domain/authorization.ts";
import type { AgentPrincipal, HumanPrincipal } from "../src/auth/principals.ts";

const member: HumanPrincipal = { kind: "human", humanId: "human-1", role: "member", email: "member@example.test", displayName: null };
const moderator: HumanPrincipal = { ...member, humanId: "human-2", role: "moderator" };
const admin: HumanPrincipal = { ...member, humanId: "human-3", role: "admin" };
const reader: AgentPrincipal = { kind: "agent", agentId: "agent-1", credentialId: "cred-1", capabilities: ["read"] };
const poster: AgentPrincipal = { kind: "agent", agentId: "agent-2", credentialId: "cred-2", capabilities: ["read", "post", "mark_solution"] };

test("human membership and agent capabilities are separate authorization paths", () => {
  assert.deepEqual(authorizeBoardRead(member), { ok: true });
  assert.deepEqual(authorizeBoardPost(member), { ok: true });
  assert.deepEqual(authorizeBoardRead(reader), { ok: true });
  assert.equal(authorizeBoardPost(reader).ok, false);
  assert.deepEqual(authorizeBoardPost(poster), { ok: true });
});

test("locked threads reject normal replies regardless of participant type", () => {
  assert.deepEqual(authorizeThreadReply(member, "locked"), { ok: false, error: { code: "thread_locked" } });
  assert.deepEqual(authorizeThreadReply(poster, "locked"), { ok: false, error: { code: "thread_locked" } });
});

test("site-wide moderation is human-only and agent management is owner-or-admin", () => {
  assert.equal(authorizeModeration(member).ok, false);
  assert.deepEqual(authorizeModeration(moderator), { ok: true });
  assert.equal(authorizeModeration(poster).ok, false);
  assert.deepEqual(authorizeManageAgent(member, "human-1"), { ok: true });
  assert.equal(authorizeManageAgent(moderator, "human-1").ok, false);
  assert.deepEqual(authorizeManageAgent(admin, "human-1"), { ok: true });
});

test("board-local moderation does not grant site authority", () => {
  assert.deepEqual(authorizeBoardModeration(member, "moderator"), { ok: true });
  assert.deepEqual(authorizeBoardModeration(member, "manager"), { ok: true });
  assert.equal(authorizeBoardModeration(member, null).ok, false);
  assert.deepEqual(authorizeBoardModeration(moderator, null), { ok: true });
  assert.equal(authorizeBoardModeration(poster, "manager").ok, false);

  assert.equal(authorizeInviteAdministration(member).ok, false);
  assert.equal(authorizeInviteAdministration(moderator).ok, false);
  assert.equal(authorizeHumanAdministration(member).ok, false);
  assert.equal(authorizeHumanAdministration(moderator).ok, false);
  assert.deepEqual(authorizeInviteAdministration(admin), { ok: true });
  assert.deepEqual(authorizeHumanAdministration(admin), { ok: true });
});

test("board managers can edit their board but lifecycle remains site-admin only", () => {
  assert.deepEqual(authorizeBoardSettings(member, "manager"), { ok: true });
  assert.equal(authorizeBoardSettings(member, "moderator").ok, false);
  assert.equal(authorizeBoardSettings(moderator, null).ok, false);
  assert.deepEqual(authorizeBoardSettings(admin, null), { ok: true });

  assert.equal(authorizeBoardLifecycle(member).ok, false);
  assert.equal(authorizeBoardLifecycle(moderator).ok, false);
  assert.deepEqual(authorizeBoardLifecycle(admin), { ok: true });
});

test("board managers may manage moderator rows but cannot touch manager authority", () => {
  assert.deepEqual(authorizeBoardStaffChange(member, "manager", null, "moderator"), { ok: true });
  assert.deepEqual(authorizeBoardStaffChange(member, "manager", "moderator", null), { ok: true });
  assert.deepEqual(authorizeBoardStaffChange(member, "manager", "moderator", "moderator"), { ok: true });
  assert.equal(authorizeBoardStaffChange(member, "manager", null, "manager").ok, false);
  assert.equal(authorizeBoardStaffChange(member, "manager", "manager", "moderator").ok, false);
  assert.equal(authorizeBoardStaffChange(member, "manager", "manager", null).ok, false);
  assert.equal(authorizeBoardStaffChange(member, "moderator", null, "moderator").ok, false);
  assert.deepEqual(authorizeBoardStaffChange(admin, null, null, "moderator"), { ok: true });
  assert.deepEqual(authorizeBoardStaffChange(admin, null, "manager", null), { ok: true });
  assert.equal(authorizeBoardStaffChange(poster, "manager", null, "moderator").ok, false);
  assert.equal(isBoardStaffRole("manager"), true);
  assert.equal(isBoardStaffRole("owner"), false);
});

test("solution authority is thread-author scoped with site or board moderator override", () => {
  assert.deepEqual(authorizeMarkSolution(member, { kind: "human", humanId: "human-1" }), { ok: true });
  assert.equal(authorizeMarkSolution(member, { kind: "human", humanId: "someone-else" }).ok, false);
  assert.deepEqual(authorizeMarkSolution(member, { kind: "agent", agentId: "agent-2" }, "moderator"), { ok: true });
  assert.deepEqual(authorizeMarkSolution(moderator, { kind: "agent", agentId: "agent-2" }), { ok: true });
  assert.deepEqual(authorizeMarkSolution(poster, { kind: "agent", agentId: "agent-2" }), { ok: true });
  assert.equal(authorizeMarkSolution(poster, { kind: "agent", agentId: "other-agent" }).ok, false);
  assert.equal(authorizeMarkSolution(reader, { kind: "agent", agentId: "agent-1" }).ok, false);
});
