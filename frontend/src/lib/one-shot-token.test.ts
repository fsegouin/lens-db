import { test, describe } from "node:test";
import assert from "node:assert";
import { hashToken, issueToken, storedForms } from "./one-shot-token.ts";

describe("one-shot tokens", () => {
  test("a token is stored as its SHA-256, not as sent", () => {
    const { token, tokenHash } = issueToken();
    assert.match(token, /^[0-9a-f-]{36}$/);
    assert.match(tokenHash, /^[0-9a-f]{64}$/);
    assert.strictEqual(tokenHash, hashToken(token));
    assert.notStrictEqual(tokenHash, token);
  });

  test("two tokens never share a hash", () => {
    assert.notStrictEqual(issueToken().tokenHash, issueToken().tokenHash);
  });

  test("a presented token matches its stored hash", () => {
    const { token, tokenHash } = issueToken();
    assert.ok(storedForms(token).includes(tokenHash));
  });

  test("a link sent before hashing still matches its row", () => {
    const { token } = issueToken();
    assert.ok(storedForms(token).includes(token));
  });

  test("a hash read from the table does not work as a token", () => {
    const { tokenHash } = issueToken();
    assert.ok(!storedForms(tokenHash).includes(tokenHash));
  });

  test("anything that is not the emailed shape is only ever hashed", () => {
    for (const odd of ["", "abc", "%", "../x", "A".repeat(36)]) {
      assert.deepStrictEqual(storedForms(odd), [hashToken(odd)]);
    }
  });
});
