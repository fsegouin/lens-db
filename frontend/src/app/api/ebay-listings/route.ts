import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";
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

const EBAY_CAMPAIGN_ID = "5339149048";

async function searchEbay(query: string, limit: number): Promise<EbayListing[]> {
  const token = await getEbayAccessToken();

  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    category_ids: "625", // Film cameras category
    filter: "deliveryCountry:US,conditions:{USED}",
    sort: "newlyListed",
  });

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "X-EBAY-C-ENDUSERCTX": `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`eBay search failed: ${res.status}`);
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
}

export async function GET(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await rateLimiters.search.limit(ip);
  if (!success) return rateLimitedResponse();

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const limit = Math.min(parseInt(searchParams.get("limit") || "6"), 12);

  if (!q) {
    return NextResponse.json({ error: "q parameter is required" }, { status: 400 });
  }

  if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) {
    return NextResponse.json({ listings: [], total: 0 });
  }

  try {
    const listings = await searchEbay(q, limit);

    return NextResponse.json({ listings, total: listings.length });
  } catch (error) {
    console.error("eBay listings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch eBay listings" },
      { status: 502 },
    );
  }
}
