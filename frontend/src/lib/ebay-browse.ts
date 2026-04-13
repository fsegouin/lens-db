import { getEbayAccessToken } from "@/lib/ebay-auth";
import type { SoldListing } from "@/lib/ebay-finding";

export interface EnrichedListing extends SoldListing {
  description: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchItemDescription(itemId: string, token: string): Promise<string> {
  // Finding API returns legacy IDs; Browse API needs v1 format
  const v1ItemId = `v1|${itemId}|0`;

  try {
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(v1ItemId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      },
    );

    if (!res.ok) return "";

    const data = await res.json();
    const raw = data.shortDescription || data.description || "";
    return stripHtml(raw).slice(0, 500);
  } catch {
    return "";
  }
}

export async function enrichListingsWithDescriptions(
  listings: SoldListing[],
): Promise<EnrichedListing[]> {
  const token = await getEbayAccessToken();

  // Fetch descriptions in parallel, batches of 10 to avoid overwhelming the API
  const enriched: EnrichedListing[] = [];
  const batchSize = 10;

  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize);
    const descriptions = await Promise.all(
      batch.map((listing) => fetchItemDescription(listing.itemId, token)),
    );
    for (let j = 0; j < batch.length; j++) {
      enriched.push({ ...batch[j], description: descriptions[j] });
    }
  }

  return enriched;
}
