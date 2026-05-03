"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import EbayTrackedLink from "@/components/EbayTrackedLink";
import EbayListingsSkeleton from "@/components/EbayListingsSkeleton";

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

interface ApiResponse {
  listings: EbayListing[];
  searchQuery: string;
  affiliateUrl: string;
}

export default function EbayListings({ query, entityType = "camera", entitySlug }: EbayListingsProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ q: query, entityType });
    fetch(`/api/ebay-listings?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ApiResponse | null) => {
        if (!cancelled) {
          setData(json);
          setDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [query, entityType]);

  if (!done) return <EbayListingsSkeleton />;
  if (!data || data.listings.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          eBay Listings
        </h3>
        <EbayTrackedLink
          href={data.affiliateUrl}
          event="ebay_view_all_click"
          eventProps={{ entity_type: entityType, entity_slug: entitySlug }}
          className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          View all on eBay
        </EbayTrackedLink>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.listings.map((listing) => (
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
              // eslint-disable-next-line @next/next/no-img-element
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
