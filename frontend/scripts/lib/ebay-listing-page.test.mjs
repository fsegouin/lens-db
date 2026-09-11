import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readListingOutcome } from "./ebay-listing-page.mjs";

/**
 * Banners verbatim from listings the watcher recorded as sold, read on
 * 2026-09-12. The seller-ended pair are the two Nikon lenses one seller pulled
 * in the same minute, which the Browse API had reported as sales.
 */

describe("readListingOutcome", () => {
  it("reads a sale", () => {
    assert.equal(
      readListingOutcome(
        "Advanced This listing sold on Tue, Sep 8 at 11:45 AM. People who viewed this item also viewed",
      ),
      "sold",
    );
  });

  it("reads a listing the seller pulled", () => {
    assert.equal(
      readListingOutcome(
        "Advanced This listing was ended by the seller on Thu, Sep 10 at 6:36 AM because the item is no longer available. ENDED US $1,699.49",
      ),
      "seller_ended",
    );
  });

  it("copes with the line breaks innerText leaves in", () => {
    assert.equal(readListingOutcome("This listing\nsold on Sun, Sep 6"), "sold");
  });

  it("does not read a seller's sales count as a sale", () => {
    assert.equal(
      readListingOutcome(
        "US $1,880.38 Condition: Used Central Selections Japan 98.6% positive feedback 1.4K items sold Joined Nov 2018",
      ),
      null,
    );
  });

  it("does not read a block page as anything", () => {
    assert.equal(readListingOutcome("Error Page | eBay Pardon our interruption"), null);
  });
});
