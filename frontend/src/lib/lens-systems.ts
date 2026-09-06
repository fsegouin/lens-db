import { db } from "@/db";
import { lensSystems } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Replace a lens's mount availability (lens_systems) with `systemIds`.
 * The primary mount (lenses.systemId) is always kept in the set — a DB
 * trigger enforces the same invariant for writes that bypass this helper.
 */
export async function syncLensSystems(
  lensId: number,
  primarySystemId: number | null | undefined,
  systemIds: number[],
): Promise<boolean> {
  const ids = new Set(systemIds.filter((n) => Number.isInteger(n)));
  if (primarySystemId) ids.add(primarySystemId);
  // Report whether the mounts actually changed, so an edit that only touched
  // the description does not have to clear every mount page's cache.
  const current = await db
    .select({ systemId: lensSystems.systemId })
    .from(lensSystems)
    .where(eq(lensSystems.lensId, lensId));
  if (current.length === ids.size && current.every((r) => ids.has(r.systemId))) return false;
  await db.transaction(async (tx) => {
    await tx.delete(lensSystems).where(eq(lensSystems.lensId, lensId));
    if (ids.size > 0) {
      await tx
        .insert(lensSystems)
        .values([...ids].map((systemId) => ({ lensId, systemId })))
        .onConflictDoNothing();
    }
  });
  return true;
}
