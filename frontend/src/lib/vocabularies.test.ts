import { test, describe } from "node:test";
import assert from "node:assert";
import {
  COVERAGE,
  ERA,
  PRODUCTION_STATUS,
  normalizeCoverage,
  normalizeEra,
  normalizeLensType,
  normalizeProductionStatus,
} from "./vocabularies.ts";

/**
 * Approving a pending edit now runs proposed values through these, so a
 * normaliser that cannot read back its own output silently drops a legitimate
 * value instead of writing it. "one-inch" did exactly that.
 */
describe("vocabularies round-trip their own values", () => {
  test("every coverage slug normalises to itself", () => {
    for (const value of COVERAGE) {
      assert.strictEqual(normalizeCoverage(value), value, `coverage ${value}`);
    }
  });

  test("every era normalises to itself", () => {
    for (const value of ERA) {
      assert.strictEqual(normalizeEra(value), value, `era ${value}`);
    }
  });

  test("every production status normalises to itself", () => {
    for (const value of PRODUCTION_STATUS) {
      assert.strictEqual(
        normalizeProductionStatus(value),
        value,
        `status ${value}`,
      );
    }
  });
});

describe("normalizeCoverage", () => {
  test("maps the wordings a spec table actually uses", () => {
    assert.strictEqual(normalizeCoverage("Four Thirds"), "micro-four-thirds");
    assert.strictEqual(normalizeCoverage("four-thirds"), "micro-four-thirds");
    assert.strictEqual(normalizeCoverage("FourThirds"), "micro-four-thirds");
    assert.strictEqual(normalizeCoverage("35mm FF"), "full-frame");
    assert.strictEqual(normalizeCoverage("APS-C"), "aps-c");
    assert.strictEqual(normalizeCoverage("Medium Format"), "medium-format");
    assert.strictEqual(normalizeCoverage('1"'), "one-inch");
  });

  test("refuses what is not a coverage at all", () => {
    // A list of mounts written into the wrong column.
    assert.strictEqual(normalizeCoverage("Canon EF, Nikon F"), null);
    assert.strictEqual(normalizeCoverage("Announced in March 1973"), null);
    assert.strictEqual(normalizeCoverage(""), null);
    assert.strictEqual(normalizeCoverage(null), null);
  });
});

describe("normalizeLensType is an open taxonomy", () => {
  test("keeps a type it has no opinion about", () => {
    assert.strictEqual(normalizeLensType("Tilt-shift lens"), "Tilt-shift lens");
    assert.strictEqual(normalizeLensType("  Prime lens  "), "Prime lens");
  });

  test("settles the spellings that were splitting rows", () => {
    assert.strictEqual(normalizeLensType("teleconverter"), "Teleconverter");
    assert.strictEqual(normalizeLensType("wide angle prime"), "Wide-angle prime lens");
  });
});
