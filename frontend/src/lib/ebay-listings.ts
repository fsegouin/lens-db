import { unstable_cache } from "next/cache";
import { buildEbaySearchQuery, buildEbayLensSearchQuery } from "@/lib/ebay-search-query";
import { getEbayAccessToken } from "@/lib/ebay-auth";
import { affiliateSearchUrl } from "@/lib/ebay-affiliate";

export interface EbayListing {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  condition: string;
  imageUrl: string;
  itemWebUrl: string;
  seller: { username: string; feedbackPercentage: string };
  listingType: string;
  shippingCost: string | null;
}

interface EbaySearchResponse {
  itemSummaries?: Array<{
    itemId: string;
    title: string;
    price: { value: string; currency: string };
    condition: string;
    image?: { imageUrl: string };
    itemAffiliateWebUrl?: string;
    itemWebUrl: string;
    seller: { username: string; feedbackPercentage: string };
    buyingOptions: string[];
    shippingOptions?: Array<{ shippingCost?: { value: string; currency: string } }>;
  }>;
  total: number;
}

const EBAY_CAMPAIGN_ID = process.env.EBAY_CAMPAIGN_ID ?? "";
const CAMERAS_AND_PHOTO_CATEGORY_ID = "625";
const LISTINGS_PER_PAGE = 6;
const EBAY_TIMEOUT_MS = 5000;
const LISTINGS_CACHE_SECONDS = 3600;

// ISO 3166-1 alpha-2 country code -> eBay Browse API marketplace ID.
// The marketplace determines both inventory and currency. Countries
// not listed here fall back to EBAY_US (USD).
const MARKETPLACE_BY_COUNTRY: Record<string, string> = {
  US: "EBAY_US",
  GB: "EBAY_GB",
  DE: "EBAY_DE",
  FR: "EBAY_FR",
  IT: "EBAY_IT",
  ES: "EBAY_ES",
  AT: "EBAY_AT",
  CH: "EBAY_CH",
  BE: "EBAY_BE",
  NL: "EBAY_NL",
  IE: "EBAY_IE",
  PL: "EBAY_PL",
  AU: "EBAY_AU",
  CA: "EBAY_CA",
};

/** Marketplace for a country code, falling back to the US site. */
function marketplaceForCountry(countryCode: string): string {
  return MARKETPLACE_BY_COUNTRY[countryCode.toUpperCase()] ?? "EBAY_US";
}

/** The eBay search string shown behind the "View all on eBay" link. */
export function searchQueryFor(query: string, entityType: "camera" | "lens"): string {
  return entityType === "lens"
    ? buildEbayLensSearchQuery(query)
    : buildEbaySearchQuery(query);
}

/** The tagged search-results link for a query on the reader's eBay site. */
export function affiliateUrl(searchQuery: string, countryCode: string): string {
  return affiliateSearchUrl(searchQuery, countryCode, EBAY_CAMPAIGN_ID);
}

async function fetchFromEbay(
  query: string,
  countryCode: string,
  entityType: "camera" | "lens",
): Promise<EbayListing[]> {
  if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) return [];

  try {
    const token = await getEbayAccessToken();
    const searchQuery = searchQueryFor(query, entityType);

    const params = new URLSearchParams({
      q: searchQuery,
      limit: String(LISTINGS_PER_PAGE),
      category_ids: CAMERAS_AND_PHOTO_CATEGORY_ID,
      filter: `deliveryCountry:${countryCode},conditions:{USED}`,
      sort: "newlyListed",
    });

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceForCountry(countryCode),
    };

    if (EBAY_CAMPAIGN_ID) {
      requestHeaders["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;
    }

    // eBay occasionally hangs; without a timeout a slow response would tie up
    // the request for as long as eBay keeps the socket open.
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      { headers: requestHeaders, signal: AbortSignal.timeout(EBAY_TIMEOUT_MS) },
    );

    if (!res.ok) {
      console.error(`eBay search failed: ${res.status}`);
      return [];
    }

    const data: EbaySearchResponse = await res.json();

    return (data.itemSummaries ?? []).map((item) => ({
      itemId: item.itemId,
      title: item.title,
      price: item.price,
      condition: item.condition,
      imageUrl: item.image?.imageUrl ?? "",
      itemWebUrl: item.itemAffiliateWebUrl ?? item.itemWebUrl,
      seller: item.seller,
      listingType: item.buyingOptions.includes("AUCTION") ? "Auction" : "Buy It Now",
      shippingCost: item.shippingOptions?.[0]?.shippingCost?.value ?? null,
    }));
  } catch (error) {
    console.error("eBay listings error:", error);
    return [];
  }
}

// Cached per (query, country, type) for an hour: entity pages are the
// most-crawled paths and previously called the eBay API on every view.
export const getEbayListings = unstable_cache(
  async (
    query: string,
    countryCode: string,
    entityType: "camera" | "lens",
  ): Promise<EbayListing[]> =>
    fetchFromEbay(query, countryCode, entityType),
  ["ebay-listings"],
  { revalidate: LISTINGS_CACHE_SECONDS, tags: ["ebay-listings"] },
);
