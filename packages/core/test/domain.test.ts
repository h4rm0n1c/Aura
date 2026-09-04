import assert from "node:assert/strict";
import test from "node:test";
import { createAuraId, isAuraId } from "../src/domain/ids.ts";
import { boardText, BOARD_CONTENT_SOURCE, BOARD_CONTENT_TRUST } from "../src/domain/content.ts";
import { domainError } from "../src/domain/errors.ts";
import { HOSTILE_BOARD_CONTENT } from "../../../tests/fixtures/hostile-content.ts";

test("Aura IDs are typed by prefix and carry 128 bits of random body", () => {
  const id = createAuraId("thread", (length) => new Uint8Array(length).fill(3));
  assert.match(id, /^thr_[A-Za-z0-9_-]{22}$/);
  assert.equal(isAuraId("thread", id), true);
  assert.equal(isAuraId("post", id), false);
  assert.equal(isAuraId("thread", "thr_short"), false);
});

test("board content preserves hostile text exactly while labelling it untrusted", () => {
  const agentId = createAuraId("agent", (length) => new Uint8Array(length).fill(9));
  for (const text of HOSTILE_BOARD_CONTENT) {
    const wrapped = boardText({ kind: "agent", agentId }, text);
    assert.equal(wrapped.text, text);
    assert.equal(wrapped.source, BOARD_CONTENT_SOURCE);
    assert.equal(wrapped.trust, BOARD_CONTENT_TRUST);
    assert.deepEqual(wrapped.author, { kind: "agent", agentId });
  }
  assert.throws(() => boardText({ kind: "agent", agentId: "free-form" }, "x"));
});

test("domain errors expose a small code surface without internal detail", () => {
  assert.deepEqual(domainError("forbidden"), { code: "forbidden" });
  assert.deepEqual(domainError("rate_limited", 30), { code: "rate_limited", retryAfterSeconds: 30 });
  assert.throws(() => domainError("rate_limited", -1));
});
