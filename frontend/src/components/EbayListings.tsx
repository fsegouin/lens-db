"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EbayListing } from "@/app/api/ebay-listings/route";

interface EbayListingsProps {
  query: string;
}

function ListingSkeleton() {
  return (
    <div className="flex gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <Skeleton className="h-20 w-20 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export default function EbayListings({ query }: EbayListingsProps) {
  const [listings, setListings] = useState<EbayListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchListings() {
      setLoading(true);
      setError(false);

      try {
        const params = new URLSearchParams({ q: query, limit: "6" });
        const res = await fetch(`/api/ebay-listings?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setListings(data.listings);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchListings();
    return () => { cancelled = true; };
  }, [query]);

  if (error) return null;
  if (!loading && listings.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          eBay Listings
        </h3>
        {!loading && listings.length > 0 && (
          <a
            href={`https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=5339149048&toolid=10001&mpre=${encodeURIComponent(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            View all on eBay
          </a>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <ListingSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((listing) => (
            <a
              key={listing.itemId}
              href={listing.itemWebUrl}
              target="_blank"
              rel="noopener noreferrer"
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
                    <span className="text-xs text-zinc-400">+${listing.shippingCost} ship</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{listing.listingType}</Badge>
                  <span className="text-xs text-zinc-400">
                    {listing.seller.username} ({listing.seller.feedbackPercentage}%)
                  </span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Listings from{" "}
        <a
          href={`https://rover.ebay.com/rover/1/711-53200-19255-0/1?campid=5339149048&toolid=10001&mpre=${encodeURIComponent(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          eBay
        </a>
      </p>
    </div>
  );
}
