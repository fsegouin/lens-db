import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// No database harness here, so this pins the source: a one-shot token must be
// consumed by the same statement that finds it. A SELECT followed later by a
// DELETE lets two concurrent requests both redeem one link.
for (const [route, table] of [
  ["./reset-password/route.ts", "passwordResetTokens"],
  ["./verify-email/route.ts", "emailVerificationTokens"],
] as const) {
  test(`${route} redeems its token with DELETE ... RETURNING`, () => {
    const src = readFileSync(new URL(route, import.meta.url), "utf8");
    const post = src.slice(src.indexOf("export async function POST"));
    const lookup = post.indexOf("storedForms(token)");
    assert.ok(lookup !== -1);
    const before = post.slice(0, lookup);
    assert.ok(before.lastIndexOf(`.delete(${table})`) > before.lastIndexOf(".select("), "the token lookup is a delete");
    assert.ok(post.slice(lookup).includes(".returning("));
  });
}
