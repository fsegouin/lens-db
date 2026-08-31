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
  { revalidate: 604800, tags: ["cameras"] },
);

export const getCameraBySlug = cache(_getCameraBySlug);
