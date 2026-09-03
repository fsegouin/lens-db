import { unstable_cache } from "next/cache";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cameras, lenses, systems } from "@/db/schema";

const _getCameraBySlug = unstable_cache(
  async (slug: string) => {
    const [result] = await db
      .select({
        camera: cameras,
        system: systems,
        // A fixed-lens body has no system, so this is what answers "what lens
        // does it have" in place of the mount.
        builtInLens: {
          id: lenses.id,
          name: lenses.name,
          slug: lenses.slug,
          focalLengthMin: lenses.focalLengthMin,
          focalLengthMax: lenses.focalLengthMax,
          apertureMin: lenses.apertureMin,
        },
      })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .leftJoin(lenses, eq(cameras.builtInLensId, lenses.id))
      .where(eq(cameras.slug, slug))
      .limit(1);
    return result ?? null;
  },
  ["camera-by-slug"],
  { revalidate: 2592000, tags: ["cameras", "lenses"] },
);

export const getCameraBySlug = cache(_getCameraBySlug);

// Redirect target for merged cameras; cached so crawls of old URLs of
// merged entities don't query per request.
const _getCameraSlugById = unstable_cache(
  async (id: number) => {
    const [row] = await db
      .select({ slug: cameras.slug })
      .from(cameras)
      .where(eq(cameras.id, id))
      .limit(1);
    return row?.slug ?? null;
  },
  ["camera-slug-by-id"],
  { revalidate: 2592000, tags: ["cameras"] },
);

export const getCameraSlugById = cache(_getCameraSlugById);
