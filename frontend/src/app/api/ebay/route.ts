import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
import {
  affiliateUrl,
  getEbayListings,
  searchQueryFor,
} from "@/lib/ebay-listings";

// Entity pages fetch their eBay listings from here on the client. Keeping the
// geo lookup (and the eBay round-trip) out of the page render is what lets
// /lenses/[slug] and /cameras/[...slug] be served from the CDN cache.
export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.ebay.limit(ip);
  if (!success) return rateLimitedResponse();

  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim().slice(0, 200);
  const entityType = params.get("type") === "lens" ? "lens" : "camera";

  if (!query) {
    return NextResponse.json({ listings: [], searchUrl: null });
  }

  const countryCode = (
    request.headers.get("x-vercel-ip-country") ?? "US"
  ).toUpperCase();
  // Guard against a malformed header reaching the eBay filter string.
  const country = /^[A-Z]{2}$/.test(countryCode) ? countryCode : "US";

  const listings = await getEbayListings(query, country, entityType);

  return NextResponse.json({
    listings,
    searchUrl: affiliateUrl(searchQueryFor(query, entityType)),
  });
}
