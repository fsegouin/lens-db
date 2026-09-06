import { unstable_cache } from "next/cache";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";
import { entityTag } from "@/lib/revalidate-entity";

// Filed under the lens's own tag as well as the broad one, so an edit to
// fields only this page shows can refresh it without emptying every list.
const _getLensBySlug = (slug: string) =>
  unstable_cache(
    async () => {
      const [result] = await db
        .select({ lens: lenses, system: systems })
        .from(lenses)
        .leftJoin(systems, eq(lenses.systemId, systems.id))
        .where(eq(lenses.slug, slug))
        .limit(1);
      return result ?? null;
    },
    ["lens-by-slug", slug],
    { revalidate: 2592000, tags: ["lenses", entityTag("lens", slug)] },
  )();

export const getLensBySlug = cache(_getLensBySlug);

// Redirect target for merged lenses; cached so crawls of old URLs of
// merged entities don't query per request.
const _getLensSlugById = unstable_cache(
  async (id: number) => {
    const [row] = await db
      .select({ slug: lenses.slug })
      .from(lenses)
      .where(eq(lenses.id, id))
      .limit(1);
    return row?.slug ?? null;
  },
  ["lens-slug-by-id"],
  { revalidate: 2592000, tags: ["lenses"] },
);

export const getLensSlugById = cache(_getLensSlugById);
