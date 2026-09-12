import { describe, test } from "node:test";
import assert from "node:assert";
import { mapConcurrent } from "./concurrent.ts";

/**
 * The asking sweep leans on two properties of this helper: that it never has
 * more than `limit` entities in flight, because eBay, the classifier and a
 * four-client pg pool are all on the other end of it, and that a slow item
 * holds up only itself.
 */

/** A worker stand-in that resolves after `ms` and records its peak overlap. */
function tracker() {
  let inFlight = 0;
  let peak = 0;
  return {
    get peak() {
      return peak;
    },
    async run<T>(value: T, ms = 0): Promise<T> {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      return value;
    },
  };
}

describe("mapConcurrent", () => {
  test("keeps results in input order however they finish", async () => {
    // Descending delays, so completion order is the reverse of input order.
    const items = [50, 40, 30, 20, 10];
    const out = await mapConcurrent(items, 5, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    assert.deepStrictEqual(out, items);
  });

  test("never runs more than the limit at once", async () => {
    const t = tracker();
    await mapConcurrent(Array.from({ length: 40 }, (_, i) => i), 8, (i) => t.run(i, 5));
    assert.strictEqual(t.peak, 8, `peak ${t.peak}: should reach 8 and never pass it`);
  });

  test("does not overlap at all when the limit is one", async () => {
    const t = tracker();
    await mapConcurrent([1, 2, 3, 4], 1, (i) => t.run(i, 2));
    assert.strictEqual(t.peak, 1);
  });

  test("runs every item even when there are fewer than the limit", async () => {
    const out = await mapConcurrent([1, 2, 3], 10, async (n) => n * 2);
    assert.deepStrictEqual(out, [2, 4, 6]);
  });

  test("a slow item delays only its own lane", async () => {
    // One item parked on a promise the test releases, eight that resolve at
    // once, two lanes. The fast lane must get through all eight rather than
    // waiting its turn behind the slow one. Gated on a promise rather than on
    // timers, because the claim is about ordering and a loaded runner is free
    // to make any timer as slow as it likes.
    let release!: () => void;
    const parked = new Promise<void>((r) => {
      release = r;
    });
    const order: number[] = [];
    const run = mapConcurrent(
      Array.from({ length: 9 }, (_, i) => i),
      2,
      async (n) => {
        if (n === 0) await parked;
        order.push(n);
      },
    );

    // The fast lane's work is all microtasks, so a turn of the event loop is
    // enough for it to get through everything. The loop is a bound, not a wait.
    for (let turn = 0; turn < 100 && order.length < 8; turn++) {
      await new Promise((r) => setImmediate(r));
    }
    assert.deepStrictEqual(order, [1, 2, 3, 4, 5, 6, 7, 8]);

    release();
    await run;
    assert.strictEqual(order.length, 9);
    assert.strictEqual(order.at(-1), 0, "the slow item should finish last");
  });

  test("returns an empty array for no items", async () => {
    assert.deepStrictEqual(await mapConcurrent([], 4, async () => 1), []);
  });

  test("runs serially rather than not at all when the limit is not a number", async () => {
    // Math.floor(NaN) would poison the lane count and skip every item
    // silently, which a caller reads as an empty queue rather than a bug.
    const t = tracker();
    const out = await mapConcurrent([1, 2, 3], Number("not a number"), (n) => t.run(n, 1));
    assert.deepStrictEqual(out, [1, 2, 3]);
    assert.strictEqual(t.peak, 1);
  });

  test("treats an unbounded limit as one lane per item", async () => {
    const t = tracker();
    await mapConcurrent([1, 2, 3, 4], Infinity, (n) => t.run(n, 2));
    assert.strictEqual(t.peak, 4);
  });

  test("a rejecting worker rejects the map", async () => {
    await assert.rejects(
      mapConcurrent([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
      /boom/,
    );
  });
});
