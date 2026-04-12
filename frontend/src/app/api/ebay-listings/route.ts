import { NextRequest, NextResponse } from "next/server";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { rateLimiters } from "@/lib/rate-limit";

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

interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
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

// Cache the OAuth token in memory (survives across requests in the same function instance)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth failed: ${res.status}`);
  }

  const data: EbayTokenResponse = await res.json();

  cachedToken = {
    token: data.access_token,
    // Expire 5 minutes early to avoid edge cases
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
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

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
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
