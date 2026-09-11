import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readListingOutcome, readListingPage } from "./ebay-listing-page.mjs";

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

describe("readListingPage", () => {
  const soldText = "This listing sold on Tue, Sep 8 at 11:45 AM.";

  it("passes a readable page through to the banner", () => {
    assert.equal(readListingPage({ status: 200, title: "Tamron 186D | eBay", text: soldText }), "sold");
  });

  it("calls a cold-session 403 blocked, not bannerless", () => {
    assert.equal(readListingPage({ status: 403, title: "Error Page | eBay", text: "" }), "blocked");
  });

  it("calls a page that never loaded blocked", () => {
    assert.equal(readListingPage({ status: null }), "blocked");
  });

  it("calls a 200 challenge page blocked", () => {
    assert.equal(
      readListingPage({ status: 200, title: "Security Measure | eBay", text: "Please verify yourself" }),
      "blocked",
    );
  });

  it("leaves a catalogue-page redirect with no verdict", () => {
    // What eBay serves for some ended listings: the product page, with other
    // sellers' listings on it and nothing about ours.
    assert.equal(
      readListingPage({
        status: 200,
        title: "Nikon NIKKOR 28-85mm f/3.5-4.5 AF Lens for sale online | eBay",
        text: "See full description Buy It Now Add to cart See all details About this product",
      }),
      null,
    );
  });
});
