import { and, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { inferBrand } from "@/lib/camera-brand";

/**
 * The brand for a camera being created, or null when the catalogue gives no
 * safe answer and it has to be set by hand on the camera's admin form.
 *
 * Reads only cameras: lens brands are left out on purpose, because that
 * column also holds lens lines filed as brands. Every branded camera is
 * loaded, two short columns of a few thousand rows, on a path that runs once
 * per camera created.
 */
export async function inferCameraBrand(name: string): Promise<string | null> {
  const rows = await db
    .select({ name: cameras.name, brand: cameras.brand })
    .from(cameras)
    .where(and(isNotNull(cameras.brand), isNull(cameras.mergedIntoId)));
  return inferBrand(
    name,
    rows.flatMap((r) => (r.brand ? [{ name: r.name, brand: r.brand }] : [])),
  );
}
