import { test, describe } from "node:test";
import assert from "node:assert";
import { hasPublishableAverage, MIN_RATINGS_FOR_AVERAGE } from "./ratings.ts";

describe("hasPublishableAverage", () => {
  test("withholds the average that one anonymous vote produced", () => {
    assert.equal(hasPublishableAverage(10, 1), false);
  });

  test("withholds it right up to the floor", () => {
    assert.equal(hasPublishableAverage(8.5, MIN_RATINGS_FOR_AVERAGE - 1), false);
  });

  test("publishes it at the floor and above", () => {
    assert.equal(hasPublishableAverage(8.5, MIN_RATINGS_FOR_AVERAGE), true);
    assert.equal(hasPublishableAverage(8.5, 500), true);
  });

  test("an unrated entity has nothing to publish", () => {
    assert.equal(hasPublishableAverage(null, 0), false);
    assert.equal(hasPublishableAverage(undefined, undefined), false);
  });

  test("a missing count is treated as none, not as enough", () => {
    assert.equal(hasPublishableAverage(9, null), false);
  });

  test("a zero average still counts once enough people have voted", () => {
    // averageRating is nullable, so `if (avg)` would drop a genuine 0.
    assert.equal(hasPublishableAverage(0, 5), true);
  });
});
