import { unstable_cache } from "next/cache";
import { buildEbaySearchQuery, buildEbayLensSearchQuery } from "@/lib/ebay-search-query";
import { getEbayAccessToken } from "@/lib/ebay-auth";

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
export function marketplaceForCountry(countryCode: string): string {
  return MARKETPLACE_BY_COUNTRY[countryCode.toUpperCase()] ?? "EBAY_US";
}

/** The eBay search string shown behind the "View all on eBay" link. */
export function searchQueryFor(query: string, entityType: "camera" | "lens"): string {
  return entityType === "lens"
    ? buildEbayLensSearchQuery(query)
    : buildEbaySearchQuery(query);
}

export function affiliateUrl(searchQuery: string): string {
  if (!EBAY_CAMPAIGN_ID) {
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}`;
  }
  return `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=${EBAY_CAMPAIGN_ID}&toolid=10001&mpre=${encodeURIComponent(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}`)}`;
}

async function fetchFromEbay(
  query: string,
  countryCode: string,
  marketplaceId: string,
  entityType: "camera" | "lens",
): Promise<EbayListing[]> {
  if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) return [];

  try {
    const token = await getEbayAccessToken();
    const searchQuery = searchQueryFor(query, entityType);

    const params = new URLSearchParams({
      q: searchQuery,
      limit: "6",
      category_ids: "625",
      filter: `deliveryCountry:${countryCode},conditions:{USED}`,
      sort: "newlyListed",
    });

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
    };

    if (EBAY_CAMPAIGN_ID) {
      requestHeaders["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;
    }

    // eBay occasionally hangs; without a timeout a slow response would tie up
    // the request for as long as eBay keeps the socket open.
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      { headers: requestHeaders, signal: AbortSignal.timeout(5000) },
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
    fetchFromEbay(query, countryCode, marketplaceForCountry(countryCode), entityType),
  ["ebay-listings"],
  { revalidate: 3600, tags: ["ebay-listings"] },
);
