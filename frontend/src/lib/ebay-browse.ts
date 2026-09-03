import { getEbayAccessToken } from "@/lib/ebay-auth";

/**
 * The Browse API, used for the two things it can actually do:
 *
 *  - search *active* listings (asking prices), and
 *  - resolve any listing by id, including one that has already ended,
 *    reporting its final price.
 *
 * It cannot search sold listings — that is Marketplace Insights, which is a
 * gated release our keys are refused. So a real sale price is only reachable
 * by noticing a listing while it is live and checking back after it closes.
 */

const BROWSE_BASE = "https://api.ebay.com/buy/browse/v1";
const MARKETPLACE = "EBAY_US";

/**
 * Live asking medians run above true sold medians by a consistent factor,
 * measured at 1.16 across the 30 lenses with the deepest sold history
 * (p10 1.00, p90 1.38, every lens within ±50%). Dividing by it converts an
 * asking median into a sold-price estimate.
 *
 * This is a calibration, not a measurement: an estimate derived through it
 * is stored with price_source 'asking' and must never be labelled a sale.
 */
export const ASKING_TO_SOLD_RATIO = 1.16;

export interface ActiveListing {
  legacyItemId: string;
  title: string;
  priceUsd: number;
  condition: string | null;
}

export interface ActiveSearchResult {
  listings: ActiveListing[];
  /** eBay's count of all matching listings, far larger than what we page. */
  total: number;
}

interface ItemSummary {
  legacyItemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
}

/** Thrown when eBay refuses the call, so callers can stop rather than guess. */
export class EbayApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "EbayApiError";
    this.status = status;
  }
}

async function browseFetch(path: string): Promise<Response> {
  const token = await getEbayAccessToken();
  return fetch(`${BROWSE_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETPLACE,
    },
    signal: AbortSignal.timeout(15000),
  });
}

/** Active used listings for a keyword query, within the camera category. */
export async function searchActiveListings(
  query: string,
  limit = 200,
): Promise<ActiveSearchResult> {
  const params = new URLSearchParams({
    q: query,
    category_ids: "625",
    limit: String(Math.min(limit, 200)),
    filter: "conditions:{USED}",
  });

  const res = await browseFetch(`/item_summary/search?${params}`);
  if (!res.ok) {
    throw new EbayApiError(res.status, `Browse search failed: ${res.status}`);
  }

  const data: { itemSummaries?: ItemSummary[]; total?: number } = await res.json();
  const listings: ActiveListing[] = [];

  for (const item of data.itemSummaries ?? []) {
    const price = parseFloat(item.price?.value ?? "");
    // Auctions report no price until a bid lands, and a listing with no
    // resolvable id cannot be watched, so neither is usable here.
    if (!item.legacyItemId || !Number.isFinite(price) || price <= 0) continue;
    listings.push({
      legacyItemId: item.legacyItemId,
      title: item.title ?? "",
      priceUsd: price,
      condition: item.condition ?? null,
    });
  }

  return { listings, total: Number(data.total ?? listings.length) };
}

export type Resolution =
  /** Still open for bids or offers. Check again later. */
  | { state: "active" }
  /** Ended having sold. `priceUsd` is the price it went for. */
  | { state: "sold"; priceUsd: number; soldOn: string }
  /** Ended without selling. */
  | { state: "expired"; endedOn: string }
  /** Ended, but the sold/unsold signals disagree — recorded as neither. */
  | { state: "ambiguous"; reason: string }
  /** eBay will no longer resolve this id at all. */
  | { state: "gone" };

interface ItemDetail {
  price?: { value?: string };
  itemEndDate?: string;
  estimatedAvailabilities?: Array<{
    estimatedAvailabilityStatus?: string;
    estimatedSoldQuantity?: number;
    estimatedRemainingQuantity?: number;
  }>;
}

/**
 * Resolve one listing by its legacy (numeric) item id.
 *
 * Ended listings stay resolvable for a long time — sales from July still
 * answered in September — so this is a single check per listing rather than
 * a poll, and there is no rush to catch a listing the moment it closes.
 *
 * The sold signal is verified: an ended, sold listing reports OUT_OF_STOCK
 * with a sold quantity and nothing remaining, and its price is the price it
 * sold for (confirmed against eight of our own recorded sales, to the cent).
 * The unsold signal is *inferred* — no ended-but-unsold listing was available
 * to test against — so anything that does not match one of the two clear
 * shapes is returned as ambiguous and recorded as neither. Inventing a sale
 * is far worse than missing one.
 */
export async function resolveListing(legacyItemId: string): Promise<Resolution> {
  const res = await browseFetch(
    `/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(legacyItemId)}`,
  );

  if (res.status === 404) return { state: "gone" };
  if (!res.ok) {
    throw new EbayApiError(res.status, `Resolve failed: ${res.status}`);
  }

  const item: ItemDetail = await res.json();

  // No end date means the listing is still running.
  if (!item.itemEndDate) return { state: "active" };

  const avail = item.estimatedAvailabilities?.[0];
  const sold = avail?.estimatedSoldQuantity ?? null;
  const remaining = avail?.estimatedRemainingQuantity ?? null;
  const endedOn = item.itemEndDate.slice(0, 10);

  if (sold == null || remaining == null) {
    return { state: "ambiguous", reason: "no availability figures" };
  }

  if (sold > 0 && remaining === 0) {
    const priceUsd = parseFloat(item.price?.value ?? "");
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
      return { state: "ambiguous", reason: "sold but no usable price" };
    }
    return { state: "sold", priceUsd, soldOn: endedOn };
  }

  if (sold === 0) return { state: "expired", endedOn };

  // Ended with stock still showing: a multi-quantity listing the seller
  // pulled, or a state we have not characterised. Not a single-unit sale.
  return {
    state: "ambiguous",
    reason: `ended with sold=${sold} remaining=${remaining}`,
  };
}
