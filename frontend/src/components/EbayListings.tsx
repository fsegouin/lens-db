import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import EbayTrackedLink from "@/components/EbayTrackedLink";
import { buildEbaySearchQuery, buildEbayLensSearchQuery } from "@/lib/ebay-search-query";
import { getEbayAccessToken } from "@/lib/ebay-auth";

interface EbayListingsProps {
  query: string;
  entityType?: "camera" | "lens";
  entitySlug: string;
}

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

async function fetchListings(query: string, countryCode: string, entityType: "camera" | "lens" = "camera"): Promise<EbayListing[]> {
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

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    };

    if (EBAY_CAMPAIGN_ID) {
      headers["X-EBAY-C-ENDUSERCTX"] = `affiliateCampaignId=${EBAY_CAMPAIGN_ID}`;
    }

    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
      { headers },
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

export default async function EbayListings({ query, entityType = "camera", entitySlug }: EbayListingsProps) {
  const hdrs = await headers();
  const countryCode = hdrs.get("x-vercel-ip-country") ?? "US";
  const listings = await fetchListings(query, countryCode, entityType);

  if (listings.length === 0) return null;

  const searchQuery = entityType === "lens"
    ? buildEbayLensSearchQuery(query)
    : buildEbaySearchQuery(query);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          eBay Listings
        </h3>
        <EbayTrackedLink
          href={affiliateUrl(searchQuery)}
          event="ebay_view_all_click"
          eventProps={{ entity_type: entityType, entity_slug: entitySlug }}
          className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          View all on eBay
        </EbayTrackedLink>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {listings.map((listing) => (
          <EbayTrackedLink
            key={listing.itemId}
            href={listing.itemWebUrl}
            event="ebay_listing_click"
            eventProps={{
              entity_type: entityType,
              entity_slug: entitySlug,
              item_id: listing.itemId,
              price: Number(listing.price.value),
              condition: listing.condition,
              listing_type: listing.listingType,
            }}
            className="flex gap-3 rounded-lg border border-zinc-200 p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50"
          >
            {listing.imageUrl && (
              <img
                src={listing.imageUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-md bg-zinc-100 object-cover dark:bg-zinc-800"
                loading="lazy"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <p className="line-clamp-2 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                {listing.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  ${parseFloat(listing.price.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {listing.shippingCost === "0.00" && (
                  <Badge variant="outline" className="text-[10px]">Free shipping</Badge>
                )}
                {listing.shippingCost && listing.shippingCost !== "0.00" && (
                  <span className="text-xs text-zinc-400">+${listing.shippingCost} shipping</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{listing.listingType}</Badge>
                <span className="text-xs text-zinc-400">
                  {listing.seller.username} ({listing.seller.feedbackPercentage}%)
                </span>
              </div>
            </div>
          </EbayTrackedLink>
        ))}
      </div>

    </div>
  );
}
