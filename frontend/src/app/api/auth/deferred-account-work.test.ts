import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// No request harness here, so this pins the source: everything a real account
// costs (revoking the old link, writing the new one, sending the email) runs
// in after(), so the response takes as long whether or not the address has an
// account, and a failure there is caught and logged rather than thrown.
for (const [route, send] of [
  ["./forgot-password/route.ts", "sendPasswordResetEmail("],
  ["./resend-verification/route.ts", "sendVerificationEmail("],
] as const) {
  test(`${route} does its per-account work after the response`, () => {
    const src = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(src, /import \{[^}]*\bafter\b[^}]*\} from "next\/server"/);
    const start = src.indexOf("after(async () => {");
    assert.ok(start !== -1, "the per-account work is scheduled with after()");
    const before = src.slice(0, start);
    const deferred = src.slice(start);
    for (const step of ["issueToken()", ".insert(", ".delete(", send]) {
      assert.ok(!before.includes(step), `${step} runs before the response`);
      assert.ok(deferred.includes(step), `${step} is deferred`);
    }
    assert.ok(deferred.indexOf("try {") < deferred.indexOf("issueToken()"), "deferred work is inside a try");
    assert.ok(deferred.includes("maskEmail("));
  });
}
