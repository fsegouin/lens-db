import { test, describe } from "node:test";
import assert from "node:assert";
import { focalRange } from "./focal-length.ts";

describe("focalRange", () => {
  test("a prime is one figure", () => assert.strictEqual(focalRange(50, 50), "50"));
  test("a zoom is a range", () => assert.strictEqual(focalRange(24, 70), "24-70"));
  test("a missing long end is not printed as null", () => assert.strictEqual(focalRange(50, null), "50"));
  test("no short end is unknown", () => {
    assert.strictEqual(focalRange(null, 70), null);
    assert.strictEqual(focalRange(0, 0), null);
  });
});
