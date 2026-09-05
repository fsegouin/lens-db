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
    throw new KehApiError(res.status, `KEH search failed: ${res.status}`);
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
