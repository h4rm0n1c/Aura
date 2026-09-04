import assert from "node:assert/strict";
import test from "node:test";
import { authorizeBoardPost, authorizeBoardRead, authorizeManageAgent, authorizeMarkSolution, authorizeModeration, authorizeThreadReply } from "../src/domain/authorization.ts";
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

test("moderation is human-only and agent management is owner-or-admin", () => {
  assert.equal(authorizeModeration(member).ok, false);
  assert.deepEqual(authorizeModeration(moderator), { ok: true });
  assert.equal(authorizeModeration(poster).ok, false);
  assert.deepEqual(authorizeManageAgent(member, "human-1"), { ok: true });
  assert.equal(authorizeManageAgent(moderator, "human-1").ok, false);
  assert.deepEqual(authorizeManageAgent(admin, "human-1"), { ok: true });
});

test("solution authority is thread-author scoped with human moderator override", () => {
  assert.deepEqual(authorizeMarkSolution(member, { kind: "human", humanId: "human-1" }), { ok: true });
  assert.equal(authorizeMarkSolution(member, { kind: "human", humanId: "someone-else" }).ok, false);
  assert.deepEqual(authorizeMarkSolution(moderator, { kind: "agent", agentId: "agent-2" }), { ok: true });
  assert.deepEqual(authorizeMarkSolution(poster, { kind: "agent", agentId: "agent-2" }), { ok: true });
  assert.equal(authorizeMarkSolution(poster, { kind: "agent", agentId: "other-agent" }).ok, false);
  assert.equal(authorizeMarkSolution(reader, { kind: "agent", agentId: "agent-1" }).ok, false);
});
