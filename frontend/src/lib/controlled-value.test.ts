import { test, describe } from "node:test";
import assert from "node:assert";
import { normalizeControlledValue, refusedValueMessage } from "./controlled-value.ts";

describe("refusedValueMessage", () => {
  test("names the field as a form shows it and lists what it takes", () => {
    assert.strictEqual(
      refusedValueMessage("productionStatus", "Current"),
      '"Current" is not a recognised production status. Use one of: In production, Discontinued, Not yet in production, Collectible.',
    );
  });

  test("does not echo a value that is not text", () => {
    assert.strictEqual(
      refusedValueMessage("shutterControl", 5),
      "That value is not a recognised shutter control. Use one of: Mechanical, Electronically controlled, Hybrid.",
    );
  });
});

describe("normalizeControlledValue", () => {
  test("refuses a value of the wrong type for a controlled field", () => {
    assert.strictEqual(normalizeControlledValue("shutterControl", 5), null);
    assert.strictEqual(normalizeControlledValue("coverage", true), null);
    assert.strictEqual(normalizeControlledValue("era", ["Film era"]), null);
  });

  test("lets a cleared field through to be written as null", () => {
    assert.strictEqual(normalizeControlledValue("shutterType", null), undefined);
  });

  test("leaves a field with no vocabulary alone", () => {
    assert.strictEqual(normalizeControlledValue("weightG", 500), undefined);
  });

  test("maps a value into its vocabulary", () => {
    assert.strictEqual(normalizeControlledValue("shutterControl", "Mechanical Copal Square"), "Mechanical");
  });
});
