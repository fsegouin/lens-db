/**
 * Run `worker` over every item with at most `limit` in flight, keeping the
 * results in the order the items came in.
 *
 * Workers pull from a shared cursor rather than being handed a fixed slice
 * each, so one slow item delays only itself. A worker that throws rejects the
 * returned promise but cancels nothing: the other lanes go on draining the
 * queue behind it. A caller that wants to survive a single failure, or to
 * stop the rest of the run after one, must catch inside its own worker rather
 * than around this call.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  // `|| 1` catches a non-numeric limit. Without it `Math.floor(NaN)` poisons
  // the lane count, `Array.from({ length: NaN })` builds no lanes at all, and
  // the map resolves to a full array of holes having never called `worker`,
  // a silent no-op the caller reads as a drained queue.
  const lanes = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;

  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await worker(items[i], i);
      }
    }),
  );

  return results;
}
