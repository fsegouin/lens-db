import { unstable_cache } from "next/cache";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";

const _getLensBySlug = unstable_cache(
  async (slug: string) => {
    const [result] = await db
      .select({ lens: lenses, system: systems })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(eq(lenses.slug, slug))
      .limit(1);
    return result ?? null;
  },
  ["lens-by-slug"],
  { revalidate: 604800, tags: ["lenses"] },
);

export const getLensBySlug = cache(_getLensBySlug);
