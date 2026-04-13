import { NextRequest, NextResponse } from "next/server";
import { EbayScraper } from "@/lib/ebay-finding";

export const maxDuration = 60;

/**
 * Scrape sold eBay listings for a single camera.
 * Isolated function so each invocation gets fresh memory for Chromium.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name parameter required" }, { status: 400 });
  }

  const scraper = new EbayScraper();
  try {
    await scraper.open();
    const listings = await scraper.scrape(name);
    return NextResponse.json({ listings });
  } catch (error) {
    console.error(`[ebay-scrape] Error scraping "${name}":`, error);
    return NextResponse.json({ listings: [] });
  } finally {
    await scraper.close();
  }
}
