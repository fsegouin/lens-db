import { test, describe } from "node:test";
import assert from "node:assert";
import { parseSuggestedNumber } from "./suggested-number.ts";

describe("parseSuggestedNumber", () => {
  test("reads the first number, not every digit run glued together", () => {
    assert.strictEqual(parseSuggestedNumber("weightG", "654 g / 1.4 lb"), 654);
    assert.strictEqual(parseSuggestedNumber("weightG", "654 g (23.1 oz)"), 654);
    assert.strictEqual(parseSuggestedNumber("maxMagnification", "0.5x (1:2)"), 0.5);
  });
  test("plain numbers and notation are unchanged", () => {
    assert.strictEqual(parseSuggestedNumber("weightG", "654"), 654);
    assert.strictEqual(parseSuggestedNumber("apertureMin", "F/2.8"), 2.8);
    assert.strictEqual(parseSuggestedNumber("maxMagnification", "0.17×"), 0.17);
    assert.strictEqual(parseSuggestedNumber("weightG", "1,200 g"), 1200);
  });
  test("a reproduction ratio is a magnification", () => {
    assert.strictEqual(parseSuggestedNumber("maxMagnification", "1:2"), 0.5);
    assert.strictEqual(parseSuggestedNumber("maxMagnification", "1:4"), 0.25);
  });
  test("a ratio written before other figures still reads as the ratio", () => {
    assert.strictEqual(parseSuggestedNumber("maxMagnification", "1:2 (0.5x)"), 0.5);
    assert.strictEqual(parseSuggestedNumber("maxMagnification", "Max. 1:4"), 0.25);
  });
  test("a 1:N aperture is f/N", () => {
    assert.strictEqual(parseSuggestedNumber("apertureMin", "1:2.8"), 2.8);
  });
  test("no number is NaN", () => {
    assert.ok(Number.isNaN(parseSuggestedNumber("weightG", "unknown")));
    assert.ok(Number.isNaN(parseSuggestedNumber("weightG", "")));
  });
});
