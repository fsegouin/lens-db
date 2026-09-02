"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import EbayTrackedLink from "@/components/EbayTrackedLink";
import EbayListingsSkeleton from "@/components/EbayListingsSkeleton";
import type { EbayListing } from "@/lib/ebay-listings";

interface EbayListingsProps {
  query: string;
  entityType?: "camera" | "lens";
  entitySlug: string;
}

function formatCurrency(value: string, currency: string): string {
  const num = parseFloat(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Fetched on the client so the surrounding page stays statically cacheable:
 * the listings depend on the visitor's country, which the /api/ebay route
 * resolves from request headers.
 */
export default function EbayListings({
  query,
  entityType = "camera",
  entitySlug,
}: EbayListingsProps) {
  const [listings, setListings] = useState<EbayListing[] | null>(null);
  const [searchUrl, setSearchUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query, type: entityType });

    fetch(`/api/ebay?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { listings: [], searchUrl: null }))
      .then((data: { listings: EbayListing[]; searchUrl: string | null }) => {
        setListings(data.listings ?? []);
        setSearchUrl(data.searchUrl);
      })
      .catch(() => setListings([]));

    return () => controller.abort();
  }, [query, entityType]);

  if (listings === null) return <EbayListingsSkeleton />;
  if (listings.length === 0) return null;

  return (
    <div className="@container space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          eBay Listings
        </h2>
        {searchUrl && (
          <EbayTrackedLink
            href={searchUrl}
            event="ebay_view_all_click"
            eventProps={{ entity_type: entityType, entity_slug: entitySlug }}
            className="text-xs text-muted-foreground underline hover:text-zinc-700"
          >
            View all on eBay
          </EbayTrackedLink>
        )}
      </div>

      <div className="grid gap-3 @lg:grid-cols-2">
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
            className="flex min-w-0 gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
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
                  {formatCurrency(listing.price.value, listing.price.currency)}
                </span>
                {listing.shippingCost === "0.00" && (
                  <Badge variant="outline" className="text-[10px]">Free shipping</Badge>
                )}
                {listing.shippingCost && listing.shippingCost !== "0.00" && (
                  <span className="text-xs text-muted-foreground">
                    + {formatCurrency(listing.shippingCost, listing.price.currency)} shipping
                  </span>
                )}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{listing.listingType}</Badge>
                <span className="truncate text-xs text-muted-foreground">
                  {listing.seller.username} ({listing.seller.feedbackPercentage}%)
                </span>
              </div>
            </div>
          </EbayTrackedLink>
        ))}
      </div>

      <p className="text-right text-[10px] text-muted-foreground">
        As an eBay Partner Network affiliate, The Lens DB earns from qualifying
        purchases.
      </p>
    </div>
  );
}
