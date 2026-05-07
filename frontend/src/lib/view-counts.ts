import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lenses, cameras, systems } from "@/db/schema";
import { redis } from "./redis";

const VALID_TYPES = ["lens", "camera", "system"] as const;
export type ViewType = (typeof VALID_TYPES)[number];

const DIRTY_SET = "views:dirty";

const tableFor = (type: ViewType) =>
  type === "lens" ? lenses : type === "camera" ? cameras : systems;

export async function bumpViewCount(type: ViewType, id: number) {
  if (!redis) {
    const table = tableFor(type);
    await db
      .update(table)
      .set({ viewCount: sql`${table.viewCount} + 1` })
      .where(eq(table.id, id));
    return;
  }
  const member = `${type}:${id}`;
  await Promise.all([
    redis.incr(`views:${member}`),
    redis.sadd(DIRTY_SET, member),
  ]);
}

export async function flushViewCounts() {
  if (!redis) return { flushed: 0, entities: 0 };

  let flushed = 0;
  let entities = 0;
  const MAX_ITERATIONS = 10_000;

  while (entities < MAX_ITERATIONS) {
    // SPOP atomically removes-and-returns a member. If a concurrent
    // bumpViewCount runs between this SPOP and the GETDEL below, its SADD
    // re-adds the marker and the next flush will pick it up.
    const member = (await redis.spop(DIRTY_SET)) as string | null;
    if (!member) break;
    entities++;

    const value = await redis.getdel(`views:${member}`);
    const n = typeof value === "number" ? value : Number(value ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;

    const [typeStr, idStr] = member.split(":");
    const id = Number(idStr);
    if (
      !VALID_TYPES.includes(typeStr as ViewType) ||
      !Number.isInteger(id) ||
      id <= 0
    ) {
      continue;
    }

    const table = tableFor(typeStr as ViewType);
    try {
      await db
        .update(table)
        .set({ viewCount: sql`${table.viewCount} + ${n}` })
        .where(eq(table.id, id));
      flushed += n;
    } catch (err) {
      console.error(`Failed to flush ${member} (+${n}):`, err);
      // Re-bank the lost increments so the next run retries.
      await Promise.all([
        redis.incrby(`views:${member}`, n),
        redis.sadd(DIRTY_SET, member),
      ]);
    }
  }

  return { flushed, entities };
}
