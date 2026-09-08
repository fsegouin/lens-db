import { test, describe } from "node:test";
import assert from "node:assert";
import {
  buildEbayLensSearchQuery,
  cleanLensKeywords,
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

describe("cleanLensKeywords", () => {
  test("tidies what the model wrote", () => {
    assert.strictEqual(cleanLensKeywords("  Canon   FD 50mm  1.4 SSC "), "Canon FD 50mm 1.4 SSC");
    assert.strictEqual(cleanLensKeywords("\"Minolta MD 135mm f/2\""), "Minolta MD 135mm f/2");
  });

  test("drops a trailing 'lens', which the wrapper adds itself", () => {
    assert.strictEqual(cleanLensKeywords("Nikon 200mm f/4 micro lens"), "Nikon 200mm f/4 micro");
    assert.strictEqual(cleanLensKeywords("Nikon 200mm f/4 Lens"), "Nikon 200mm f/4");
  });

  test("refuses anything that would exclude words or is not a query", () => {
    assert.strictEqual(cleanLensKeywords("Canon FD 50mm -SSC"), null);
    assert.strictEqual(cleanLensKeywords(""), null);
    assert.strictEqual(cleanLensKeywords("   "), null);
    assert.strictEqual(cleanLensKeywords(null), null);
    assert.strictEqual(cleanLensKeywords("x".repeat(81)), null);
  });
});
