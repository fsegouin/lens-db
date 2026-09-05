import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/api-utils";
import { db } from "@/db";
import { kehProducts } from "@/db/schema";
import { sql } from "drizzle-orm";
import { searchKehProducts, KehApiError, KEH_MAX_PAGE_SIZE } from "@/lib/keh";

/**
 * Mirrors KEH's lens catalogue into keh_products.
 *
 * Every page costs one credit against a 300/month allowance, so this is the
 * only place in the pipeline that spends anything. Matching, pricing and
 * everything downstream reads the mirror.
 *
 * A full sweep is ~4,700 products over 47 pages. Fortnightly is plenty: used
 * dealer prices move slowly, and at ~94 credits a month it leaves most of the
 * allowance spare.
 */

/**
 * Hard ceiling on credits one call may spend, whatever the caller asks for.
 * A bug in a loop somewhere should cost a few credits, not the month's
 * allowance, and a full sweep only needs 47.
 */
const MAX_PAGES_PER_RUN = 60;
const DEFAULT_MAX_PAGES = 50;

/**
 * KEH titles all carry the word "Lens", so this one query reaches the lens
 * catalogue without paying for a category lookup first. Verified at 4,683
 * results across 47 pages.
 */
const LENS_QUERY = "lens";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const startPage = Math.max(1, Number(params.get("startPage")) || 1);
  const maxPages = Math.min(
    MAX_PAGES_PER_RUN,
    Math.max(1, Number(params.get("maxPages")) || DEFAULT_MAX_PAGES),
  );

  let creditsSpent = 0;
  let seen = 0;
  let stored = 0;
  let totalPages = 0;
  let totalResults = 0;
  let stoppedBecause: string | null = null;

  for (let page = startPage; page < startPage + maxPages; page++) {
    let result;
    try {
      result = await searchKehProducts(LENS_QUERY, page, KEH_MAX_PAGE_SIZE);
      creditsSpent++;
    } catch (error) {
      // Every failure mode here means stop: a 429 says we are over the rate
      // limit, a 401 says the key is wrong, and neither improves by retrying
      // in the same run. Carrying on would spend credits to no purpose.
      const status = error instanceof KehApiError ? error.status : 0;
      stoppedBecause = `api error ${status}`;
      console.error(`[keh-catalogue] page ${page}:`, error);
      break;
    }

    totalPages = result.totalPages;
    totalResults = result.totalResults;
    if (result.products.length === 0) {
      stoppedBecause = "empty page";
      break;
    }
    seen += result.products.length;

    const rows = result.products.map((p) => ({
      kehId: p.kehId,
      title: p.title,
      url: p.url,
      manufacturer: p.manufacturer,
      system: p.system,
      productType: p.productType,
      minPriceUsd: p.minPriceUsd,
      maxPriceUsd: p.maxPriceUsd,
      quantityAvailable: p.quantityAvailable,
      grades: p.grades,
      fetchedAt: new Date(),
    }));

    const inserted = await db
      .insert(kehProducts)
      .values(rows)
      // Prices and stock are refreshed; the match is not. A product that has
      // already been matched to a lens, or found to belong to none, keeps
      // that verdict across sweeps so it is never re-examined.
      .onConflictDoUpdate({
        target: kehProducts.kehId,
        set: {
          title: sql`excluded.title`,
          url: sql`excluded.url`,
          manufacturer: sql`excluded.manufacturer`,
          system: sql`excluded.system`,
          productType: sql`excluded.product_type`,
          minPriceUsd: sql`excluded.min_price_usd`,
          maxPriceUsd: sql`excluded.max_price_usd`,
          quantityAvailable: sql`excluded.quantity_available`,
          grades: sql`excluded.grades`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      })
      .returning({ id: kehProducts.id });
    stored += inserted.length;

    if (page >= result.totalPages) {
      stoppedBecause = "reached last page";
      break;
    }
  }

  const [{ mirrored }] = await db
    .select({ mirrored: sql<number>`count(*)` })
    .from(kehProducts);
  const [{ unmatched }] = await db
    .select({ unmatched: sql<number>`count(*)` })
    .from(kehProducts)
    .where(sql`match_state IS NULL`);

  return NextResponse.json({
    creditsSpent,
    pagesRead: creditsSpent,
    productsSeen: seen,
    rowsWritten: stored,
    catalogueTotal: totalResults,
    cataloguePages: totalPages,
    stoppedBecause,
    mirrored: Number(mirrored),
    awaitingMatch: Number(unmatched),
  });
}
