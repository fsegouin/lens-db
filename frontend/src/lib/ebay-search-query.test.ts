import { test, describe } from "node:test";
import assert from "node:assert";
import {
  buildEbayLensSearchQuery,
  buildEbaySearchQuery,
  cameraQueryFromKeywords,
  cleanSearchKeywords,
  lensQueryFromKeywords,
} from "./ebay-search-query.ts";

/**
 * The Browse API wants every word of a query in the listing title. The
 * catalogue name is tried first; when it finds nothing, a model writes the
 * words a seller would use and those go through the same wrapper, so the
 * exclusions that keep bodies and kits out apply to both.
 */
describe("lensQueryFromKeywords", () => {
  test("the catalogue-name query and the keyword query share one shape", () => {
    assert.strictEqual(
      buildEbayLensSearchQuery("Canon FD 50mm F/1.4 S.S.C. (I)"),
      "Canon FD 50mm F/1.4 S.S.C. lens -body -kit -bundle",
    );
    assert.strictEqual(
      lensQueryFromKeywords("Canon FD 50mm 1.4 SSC"),
      "Canon FD 50mm 1.4 SSC lens -body -kit -bundle",
    );
  });
});

/**
 * The catalogue writes the names a body was sold under elsewhere in
 * brackets. Every one of those words would be required in the title, and no
 * listing carries them all, so they cannot be part of the query.
 */
describe("buildEbaySearchQuery", () => {
  test("drops the bracketed market names and historical maker prefixes", () => {
    assert.strictEqual(
      buildEbaySearchQuery("Canon EOS Rebel T6i (EOS 750D / Kiss X8i)"),
      "Canon EOS Rebel T6i camera body",
    );
    assert.strictEqual(
      buildEbaySearchQuery("Asahi Pentax Spotmatic SP"),
      "Pentax Spotmatic SP camera body",
    );
  });

  test("the keyword query asks only for a camera, since it runs when the body query found nothing", () => {
    assert.strictEqual(cameraQueryFromKeywords("Sony A77 II"), "Sony A77 II camera");
  });
});

describe("cleanSearchKeywords", () => {
  test("tidies what the model wrote", () => {
    assert.strictEqual(cleanSearchKeywords("  Canon   FD 50mm  1.4 SSC "), "Canon FD 50mm 1.4 SSC");
    assert.strictEqual(cleanSearchKeywords("\"Minolta MD 135mm f/2\""), "Minolta MD 135mm f/2");
  });

  test("drops a trailing product word, which the wrapper adds itself", () => {
    assert.strictEqual(cleanSearchKeywords("Nikon 200mm f/4 micro lens"), "Nikon 200mm f/4 micro");
    assert.strictEqual(cleanSearchKeywords("Nikon 200mm f/4 Lens"), "Nikon 200mm f/4");
    assert.strictEqual(cleanSearchKeywords("Leica M6 camera body"), "Leica M6");
    assert.strictEqual(cleanSearchKeywords("Leica M6 camera"), "Leica M6");
  });

  test("refuses anything that would exclude words or is not a query", () => {
    assert.strictEqual(cleanSearchKeywords("Canon FD 50mm -SSC"), null);
    assert.strictEqual(cleanSearchKeywords(""), null);
    assert.strictEqual(cleanSearchKeywords("   "), null);
    assert.strictEqual(cleanSearchKeywords(null), null);
    assert.strictEqual(cleanSearchKeywords("x".repeat(81)), null);
  });
});
