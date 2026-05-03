import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { buildEbaySearchQuery, buildEbayLensSearchQuery } from "@/lib/ebay-search-query";
import { getEbayAccessToken } from "@/lib/ebay-auth";

interface EbayListing {
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

function affiliateUrl(searchQuery: string): string {
  if (!EBAY_CAMPAIGN_ID) {
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}`;
  }
  return `https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=${EBAY_CAMPAIGN_ID}&toolid=10001&mpre=${encodeURIComponent(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}`)}`;
}

async function fetchListings(
  query: string,
  countryCode: string,
  entityType: "camera" | "lens",
): Promise<EbayListing[]> {
  if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) return [];

  try {
    const token = await getEbayAccessToken();
    const searchQuery = entityType === "lens"
      ? buildEbayLensSearchQuery(query)
      : buildEbaySearchQuery(query);

    const params = new URLSearchParams({
      q: searchQuery,
      limit: "6",
      category_ids: "625",
      filter: `deliveryCountry:${countryCode},conditions:{USED}`,
      sort: "newlyListed",
    });

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    };

    if (EBAY_CAMPAIGN_ID) {
      requestHeaders["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;
    }

    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      { headers: requestHeaders },
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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.slice(0, 200) ?? "";
  const entityType = url.searchParams.get("entityType") === "lens" ? "lens" : "camera";

  if (!query) {
    return NextResponse.json({ listings: [], searchQuery: "", affiliateUrl: "" });
  }

  const hdrs = await headers();
  const countryCode = hdrs.get("x-vercel-ip-country") ?? "US";

  const listings = await fetchListings(query, countryCode, entityType);
  const searchQuery = entityType === "lens"
    ? buildEbayLensSearchQuery(query)
    : buildEbaySearchQuery(query);

  return NextResponse.json({
    listings,
    searchQuery,
    affiliateUrl: affiliateUrl(searchQuery),
  });
}
