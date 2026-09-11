import { describe, test } from "node:test";
import assert from "node:assert";
import { decide, needsBrowse } from "./ebay-resolution.ts";

/**
 * The one rule that matters most: a sale is recorded only when the listing
 * page and the Browse API both say sold. Browse alone called 41 seller-ended
 * listings sales in September 2026.
 */

const browseSold = { state: "sold", priceUsd: 19.99, soldOn: "2026-09-08" } as const;

describe("decide", () => {
  test("records a sale when the page and Browse agree", () => {
    assert.deepStrictEqual(decide("sold", browseSold), {
      action: "record_sale",
      priceUsd: 19.99,
      soldOn: "2026-09-08",
    });
  });

  test("never records Browse's sale without the page's banner", () => {
    assert.deepStrictEqual(decide(null, browseSold), { action: "retire", resolution: "ambiguous" });
  });

  test("retires a seller-ended listing whatever Browse would say", () => {
    assert.deepStrictEqual(decide("seller_ended", null), {
      action: "retire",
      resolution: "seller_ended",
    });
  });

  test("retires as ambiguous when the page says sold and Browse does not", () => {
    assert.deepStrictEqual(decide("sold", { state: "expired", endedOn: "2026-09-08" }), {
      action: "retire",
      resolution: "ambiguous",
    });
  });

  test("trusts Browse on a listing that did not sell", () => {
    assert.deepStrictEqual(decide(null, { state: "expired", endedOn: "2026-09-08" }), {
      action: "retire",
      resolution: "expired",
    });
  });

  test("sends a bannerless live listing back to the watch list", () => {
    assert.deepStrictEqual(decide(null, { state: "active" }), { action: "still_live" });
  });

  test("retires a listing eBay no longer resolves", () => {
    assert.deepStrictEqual(decide("sold", { state: "gone" }), { action: "retire", resolution: "gone" });
  });

  test("learns nothing from a blocked page", () => {
    assert.deepStrictEqual(decide("blocked", browseSold), { action: "skip_for_a_day" });
  });

  test("waits a day when Browse was needed but not asked", () => {
    assert.deepStrictEqual(decide("sold", null), { action: "skip_for_a_day" });
    assert.deepStrictEqual(decide(null, null), { action: "skip_for_a_day" });
  });
});

describe("needsBrowse", () => {
  test("asks Browse only for a confirmed sale's price or a bannerless page", () => {
    assert.strictEqual(needsBrowse("sold"), true);
    assert.strictEqual(needsBrowse(null), true);
    assert.strictEqual(needsBrowse("seller_ended"), false);
    assert.strictEqual(needsBrowse("blocked"), false);
  });
});
