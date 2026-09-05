/**
 * KEH's used-gear catalogue, read through the parse.bot API.
 *
 * KEH itself refuses automated access outright: Cloudflare challenges every
 * request, headed or headless, so there is no direct route. This third-party
 * API is the sanctioned way in, and it bills per call against a small monthly
 * allowance, which shapes everything here. Callers enumerate the catalogue in
 * bulk and match locally; nothing looks up a single lens on demand.
 *
 * What it returns is a price *range* across KEH's condition grades, not a
 * price per grade. Their product pages show the full ladder but the API
 * exposes only the ends of it plus the grade names.
 */

const ROOT =
  "https://api.parse.bot/scraper/665fddb5-5793-4f04-b3cf-87b1b256054d";

/**
 * The largest page the API will actually serve. It accepts larger values and
 * silently returns 100, so asking for more only wastes the credit.
 */
export const KEH_MAX_PAGE_SIZE = 100;

/**
 * KEH's prices run above what the same lens fetches privately on eBay, and by
 * a consistent enough factor to correct for.
 *
 * Measured across 627 lenses holding both a KEH match and eight or more
 * recorded eBay sales: the midpoint of KEH's range divided by our sold median
 * has a median of 1.18, with 78% inside half a turn and 96% inside a factor of
 * two. The gap is the dealer's margin and the 180-day warranty, which is a
 * real difference in what is being sold rather than noise.
 *
 * Tighter than it looks, too: before non-lens products were excluded the tenth
 * percentile sat at 0.58, and it was lens hoods dragging it down.
 */
export const KEH_TO_SOLD_RATIO = 1.18;

export interface KehProduct {
  kehId: string;
  title: string;
  url: string | null;
  manufacturer: string | null;
  system: string | null;
  productType: string | null;
  minPriceUsd: number | null;
  maxPriceUsd: number | null;
  quantityAvailable: number | null;
  grades: string[];
}

export interface KehPage {
  products: KehProduct[];
  totalResults: number;
  totalPages: number;
}

/** Thrown when the API refuses, so callers stop rather than burn credits. */
export class KehApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "KehApiError";
    this.status = status;
  }
}

interface RawProduct {
  id?: string | number;
  title?: string;
  url?: string;
  manufacturer?: string;
  system?: string;
  product_type?: string;
  min_price?: number;
  max_price?: number;
  quantity_available?: number;
  grades?: string[];
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalise(p: RawProduct): KehProduct | null {
  if (p.id == null || !p.title) return null;
  return {
    kehId: String(p.id),
    title: p.title,
    url: p.url ?? null,
    manufacturer: p.manufacturer ?? null,
    system: p.system ?? null,
    productType: p.product_type ?? null,
    minPriceUsd: toNumber(p.min_price),
    maxPriceUsd: toNumber(p.max_price),
    quantityAvailable: toNumber(p.quantity_available),
    grades: Array.isArray(p.grades) ? p.grades.filter((g) => typeof g === "string") : [],
  };
}

/**
 * One page of results. Costs one credit whether it returns 1 product or 100,
 * so always ask for the maximum.
 */
export async function searchKehProducts(
  query: string,
  page: number,
  pageSize: number = KEH_MAX_PAGE_SIZE,
): Promise<KehPage> {
  const key = process.env.PARSE_API_KEY;
  if (!key) throw new KehApiError(0, "PARSE_API_KEY is not set");

  const params = new URLSearchParams({
    query,
    page: String(page),
    page_size: String(Math.min(pageSize, KEH_MAX_PAGE_SIZE)),
  });

  const res = await fetch(`${ROOT}/search_products?${params}`, {
    headers: { "X-API-Key": key, "API-Snapshot-Version": "6" },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    // The body carries the only thing worth knowing when this fails: whether
    // a 429 means "too fast" or "out of credits for the month". Those want
    // opposite responses and the status alone cannot tell them apart.
    const detail = await res.text().catch(() => "");
    throw new KehApiError(
      res.status,
      `KEH search failed: ${res.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const body = (await res.json()) as {
    data?: {
      products?: RawProduct[];
      total_results?: number;
      total_pages?: number;
    };
  };
  const data = body.data ?? {};
  return {
    products: (data.products ?? []).map(normalise).filter((p): p is KehProduct => p !== null),
    totalResults: Number(data.total_results ?? 0),
    totalPages: Number(data.total_pages ?? 0),
  };
}
