import { test, describe } from "node:test";
import assert from "node:assert";
import { maxApertureLabel } from "./aperture.ts";

/**
 * The page used to print "Maximum Aperture: f/3.5" and "Minimum Aperture:
 * f/4.5" as two rows, which reads as though f/4.5 were the stopped-down limit.
 * Both numbers are wide-open values, so they belong on one row.
 */
describe("maxApertureLabel", () => {
  test("a variable-aperture zoom reads as a range", () => {
    assert.strictEqual(maxApertureLabel(3.5, 4.5), "f/3.5-4.5");
    assert.strictEqual(maxApertureLabel(2.8, 4.5), "f/2.8-4.5");
  });

  test("a prime or constant-aperture zoom reads as one figure", () => {
    assert.strictEqual(maxApertureLabel(2.8, 2.8), "f/2.8");
    assert.strictEqual(maxApertureLabel(1.4, 1.4), "f/1.4");
  });

  test("a missing long end falls back to the one figure we have", () => {
    assert.strictEqual(maxApertureLabel(2.8, null), "f/2.8");
    assert.strictEqual(maxApertureLabel(2.8, undefined), "f/2.8");
  });

  test("no wide-open value at all is null, never a half-written range", () => {
    assert.strictEqual(maxApertureLabel(null, null), null);
    assert.strictEqual(maxApertureLabel(undefined, undefined), null);
    // apertureMax without apertureMin is incoherent; no row beats "f/-5.6".
    assert.strictEqual(maxApertureLabel(null, 5.6), null);
  });

  test("an unusually fast lens is not mistaken for missing data", () => {
    // Zeiss N-Mirotar 210mm f/0.03 is a real image-intensifier lens.
    assert.strictEqual(maxApertureLabel(0.03, 0.03), "f/0.03");
  });
});
