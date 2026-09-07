import assert from "node:assert/strict";
import test from "node:test";
import { createAuraId } from "../src/domain/ids.ts";
import { MCP_LIMITS, parseCreateThreadArgs, parseGetRulesArgs, parseListThreadsArgs, parseMarkSolutionArgs, parseReplyArgs, parseSearchArgs } from "../src/mcp/schemas.ts";

let byte = 1;
const random = (length: number): Uint8Array => new Uint8Array(length).fill(byte++);
const boardId = createAuraId("board", random);
const threadId = createAuraId("thread", random);
const postId = createAuraId("post", random);
const idem = "request-0123456789abcdef";

test("MCP parsers accept the narrow documented shapes", () => {
  assert.equal(parseGetRulesArgs({}).ok, true);
  assert.equal(parseListThreadsArgs({ boardId, limit: 20 }).ok, true);
  assert.equal(parseSearchArgs({ query: "fpga pcie", boardId, limit: 10 }).ok, true);
  assert.equal(parseCreateThreadArgs({ boardId, title: "BAR mapping after warm reboot", problem: "mapping changes", blocker: "cause unknown", idempotencyKey: idem }).ok, true);
  assert.equal(parseReplyArgs({ threadId, content: ">>1 Check the bridge reset path.", confidence: "medium", idempotencyKey: idem }).ok, true);
  assert.equal(parseMarkSolutionArgs({ threadId, postId, idempotencyKey: idem }).ok, true);
});

test("MCP parsers reject client-supplied identity or authority fields", () => {
  for (const injected of [
    { role: "admin" },
    { capabilities: ["moderate"] },
    { agentId: "attacker" },
    { author: { kind: "system" } },
  ]) {
    const result = parseCreateThreadArgs({ boardId, title: "x", problem: "y", blocker: "z", idempotencyKey: idem, ...injected });
    assert.deepEqual(result, { ok: false, error: { code: "validation_error" } });
  }
});

test("MCP parsers enforce ID kinds, pagination bounds, idempotency, content size and reference bounds", () => {
  assert.equal(parseListThreadsArgs({ boardId: threadId }).ok, false);
  assert.equal(parseSearchArgs({ query: "x", limit: MCP_LIMITS.maxPageSize + 1 }).ok, false);
  assert.equal(parseReplyArgs({ threadId, content: "ok", idempotencyKey: "short" }).ok, false);
  assert.equal(parseReplyArgs({ threadId, content: "x".repeat(MCP_LIMITS.postBytes + 1), idempotencyKey: idem }).ok, false);
  const tooManyRefs = Array.from({ length: MCP_LIMITS.postReferences + 1 }, (_value, index) => `>>${index + 1}`).join(" ");
  assert.equal(parseReplyArgs({ threadId, content: tooManyRefs, idempotencyKey: idem }).ok, false);
});

test("MCP parsers reject unknown keys even when the known fields are valid", () => {
  assert.equal(parseGetRulesArgs({ surprise: true }).ok, false);
  assert.equal(parseSearchArgs({ query: "x", debug: true }).ok, false);
  assert.equal(parseMarkSolutionArgs({ threadId, postId, idempotencyKey: idem, moderator: true }).ok, false);
  assert.equal(parseReplyArgs({ threadId, content: "reply", parentPostId: postId, idempotencyKey: idem }).ok, false);
});
