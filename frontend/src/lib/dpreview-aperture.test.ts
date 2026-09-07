import { test, describe } from "node:test";
import assert from "node:assert";
import { parseAperture, parseApertureLongEnd } from "./dpreview-import.ts";

/**
 * Both aperture columns describe the lens WIDE OPEN: aperture_min at the short
 * end of a zoom, aperture_max at the long end. Reading DPReview's "Minimum
 * aperture" row (F22, F32) into aperture_max is the defect migration 0058
 * repaired on 450 primes and 77 zooms, so these tests pin the convention.
 */
describe("aperture parsing", () => {
  test("a variable-aperture zoom keeps both ends", () => {
    assert.strictEqual(parseAperture("F3.5-4.5"), 3.5);
    assert.strictEqual(parseApertureLongEnd("F3.5-4.5"), 4.5);
    assert.strictEqual(parseApertureLongEnd("F3.5-6.3"), 6.3);
  });

  test("a prime or constant-aperture zoom has the same value at both ends", () => {
    assert.strictEqual(parseAperture("F2.8"), 2.8);
    assert.strictEqual(parseApertureLongEnd("F2.8"), 2.8);
    assert.strictEqual(parseApertureLongEnd("Olympus Zuiko Digital 50mm F2"), 2);
  });

  test("the long end is read from the name when the spec row is absent", () => {
    assert.strictEqual(
      parseApertureLongEnd("Olympus Zuiko Digital 40-150mm F3.5-4.5"),
      4.5,
    );
  });

  test("slashed and spaced notation parse the same", () => {
    assert.strictEqual(parseApertureLongEnd("F/4-5.6"), 5.6);
    assert.strictEqual(parseApertureLongEnd("Canon EF 70-300mm F/4-5.6 IS USM"), 5.6);
  });

  test("no aperture at all is null, not a guess", () => {
    assert.strictEqual(parseApertureLongEnd("Nikon Z 24-70mm"), null);
    assert.strictEqual(parseApertureLongEnd(""), null);
    assert.strictEqual(parseApertureLongEnd(null), null);
  });

  test("the stopped-down limit is never the long end", () => {
    // "F22" is what DPReview puts in its "Minimum aperture" row. Handed the
    // right row instead, the long end of this lens is 4.5, never 22.
    assert.notStrictEqual(
      parseApertureLongEnd("Olympus Zuiko Digital 40-150mm F3.5-4.5"),
      22,
    );
  });
});
