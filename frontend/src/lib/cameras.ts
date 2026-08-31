import { unstable_cache } from "next/cache";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cameras, systems } from "@/db/schema";

const _getCameraBySlug = unstable_cache(
  async (slug: string) => {
    const [result] = await db
      .select({ camera: cameras, system: systems })
      .from(cameras)
      .leftJoin(systems, eq(cameras.systemId, systems.id))
      .where(eq(cameras.slug, slug))
      .limit(1);
    return result ?? null;
  },
  ["camera-by-slug"],
  { revalidate: 2592000, tags: ["cameras"] },
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
