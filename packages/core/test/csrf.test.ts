import assert from "node:assert/strict";
import test from "node:test";

import {
  csrfAction,
  importCsrfKey,
  issueCsrfToken,
  verifyCsrfToken,
} from "../src/auth/csrf.ts";

const secret = new Uint8Array(32).fill(0x42);
const nonceSource = (length: number): Uint8Array => new Uint8Array(length).fill(0x23);

test("CSRF token is bound to principal and action", async () => {
  const key = await importCsrfKey(secret);
  const action = csrfAction("post", "/agents/revoke");
  const token = await issueCsrfToken({
    key,
    principalKey: "human:1",
    action,
    nowSeconds: 1_800_000_000,
    randomBytes: nonceSource,
  });

  assert.equal(
    await verifyCsrfToken({
      key,
      principalKey: "human:1",
      action,
      token,
      nowSeconds: 1_800_000_010,
    }),
    true,
  );
  assert.equal(
    await verifyCsrfToken({
      key,
      principalKey: "human:2",
      action,
      token,
      nowSeconds: 1_800_000_010,
    }),
    false,
  );
  assert.equal(
    await verifyCsrfToken({
      key,
      principalKey: "human:1",
      action: csrfAction("POST", "/threads/new"),
      token,
      nowSeconds: 1_800_000_010,
    }),
    false,
  );
});

test("CSRF token rejects expiry, excessive future skew, and tampering", async () => {
  const key = await importCsrfKey(secret);
  const action = csrfAction("POST", "/reply");
  const token = await issueCsrfToken({
    key,
    principalKey: "human:1",
    action,
    nowSeconds: 1_800_000_000,
    randomBytes: nonceSource,
  });

  assert.equal(
    await verifyCsrfToken({
      key,
      principalKey: "human:1",
      action,
      token,
      nowSeconds: 1_800_007_201,
    }),
    false,
  );

  const future = await issueCsrfToken({
    key,
    principalKey: "human:1",
    action,
    nowSeconds: 1_800_000_100,
    randomBytes: nonceSource,
  });
  assert.equal(
    await verifyCsrfToken({
      key,
      principalKey: "human:1",
      action,
      token: future,
      nowSeconds: 1_800_000_000,
      clockSkewSeconds: 60,
    }),
    false,
  );

  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(
    await verifyCsrfToken({
      key,
      principalKey: "human:1",
      action,
      token: tampered,
      nowSeconds: 1_800_000_010,
    }),
    false,
  );
});

test("CSRF key and scope validation rejects weak or ambiguous inputs", async () => {
  await assert.rejects(() => importCsrfKey(new Uint8Array(31)), /at least 32 bytes/);
  assert.throws(() => csrfAction("POST", "not-a-path"), /invalid pathname/);
  assert.throws(() => csrfAction("GET", "/x"), /state-changing HTTP method/);
  assert.throws(() => csrfAction("PO\nST", "/x"), /state-changing HTTP method/);
});
