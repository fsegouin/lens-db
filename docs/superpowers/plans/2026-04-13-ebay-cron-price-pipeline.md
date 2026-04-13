# eBay Cron Price Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python batch eBay price scripts with a daily Vercel cron endpoint that rotates through cameras, fetches sold listings via the eBay Finding API, enriches with descriptions via the Browse API, classifies with the existing LLM, and stores price data.

**Architecture:** A GET endpoint at `/api/cron/ebay-prices` secured by `CRON_SECRET`. It selects a batch of cameras (oldest/never-processed first), calls the Finding API for sold listings, fetches descriptions via Browse API, classifies via the existing Gemini LLM, stores sales in `price_history`, and recomputes `price_estimates`. Shared eBay auth and price pipeline logic are extracted into `src/lib/` modules.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM (Neon PostgreSQL), Vercel AI SDK (Gemini 2.0 Flash Lite), eBay Finding API + Browse API, Zod

**Spec:** `docs/superpowers/specs/2026-04-13-ebay-cron-price-pipeline-design.md`

---

### Task 1: Extract eBay OAuth into shared module

Extract the OAuth token logic from `src/app/api/ebay-listings/route.ts` into a shared module, and switch env var names to `EBAY_APP_ID`/`EBAY_CERT_ID`.

**Files:**
- Create: `src/lib/ebay-auth.ts`
- Modify: `src/app/api/ebay-listings/route.ts`

- [ ] **Step 1: Create `src/lib/ebay-auth.ts`**

```typescript
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getEbayAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CERT_ID;

  if (!clientId || !clientSecret) {
    throw new Error("EBAY_APP_ID and EBAY_CERT_ID are required");
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

  const data: { access_token: string; expires_in: number; token_type: string } = await res.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}
```

- [ ] **Step 2: Update `src/app/api/ebay-listings/route.ts`**

Remove the `EbayTokenResponse` interface, the `cachedToken` variable, and the `getEbayAccessToken` function. Replace with an import:

```typescript
import { getEbayAccessToken } from "@/lib/ebay-auth";
```

Remove these env var references in the route:
- Change `process.env.EBAY_CLIENT_ID` → `process.env.EBAY_APP_ID`
- Change `process.env.EBAY_CLIENT_SECRET` → `process.env.EBAY_CERT_ID`

The guard in the GET handler becomes:
```typescript
if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) {
  return NextResponse.json({ listings: [], total: 0 });
}
```

- [ ] **Step 3: Verify the dev server starts and `/api/ebay-listings` still works**

Run: `cd frontend && pnpm dev`

Test: `curl "http://localhost:3000/api/ebay-listings?q=Canon+AE-1"` — should return listings.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ebay-auth.ts src/app/api/ebay-listings/route.ts
git commit -m "Extract eBay OAuth into shared lib, unify env var names"
```

---

### Task 2: Create eBay Finding API client

Build the Finding API client that searches for completed/sold items.

**Files:**
- Create: `src/lib/ebay-finding.ts`

- [ ] **Step 1: Create `src/lib/ebay-finding.ts`**

```typescript
const FINDING_API_URL = "https://svcs.ebay.com/services/search/FindingService/v1";

export interface SoldListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  date: string; // YYYY-MM-DD
  condition: string;
  url: string;
}

function buildSearchQuery(cameraName: string): string {
  let name = cameraName;
  for (const prefix of ["Asahi ", "Nippon Kogaku "]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
    }
  }
  return `${name} camera body`;
}

export async function searchSoldItems(cameraName: string): Promise<SoldListing[]> {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    throw new Error("EBAY_APP_ID is required");
  }

  const query = buildSearchQuery(cameraName);

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "",
    "keywords": query,
    "categoryId": "625",
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "itemFilter(1).name": "ListingType",
    "itemFilter(1).value": "FixedPrice,AuctionWithBIN,Auction",
    "sortOrder": "EndTimeSoonest",
    "paginationInput.entriesPerPage": "50",
  });

  const res = await fetch(`${FINDING_API_URL}?${params}`);

  if (!res.ok) {
    throw new Error(`Finding API failed: ${res.status}`);
  }

  const data = await res.json();

  const response = data.findCompletedItemsResponse?.[0];
  if (!response || response.ack?.[0] !== "Success") {
    return [];
  }

  const items = response.searchResult?.[0]?.item ?? [];

  return items.map((item: Record<string, unknown[]>) => {
    const sellingStatus = (item.sellingStatus as Record<string, unknown[]>[])?.[0];
    const currentPrice = (sellingStatus?.currentPrice as Record<string, string>[])?.[0];
    const listingInfo = (item.listingInfo as Record<string, string[]>[])?.[0];
    const condition = (item.condition as Record<string, string[]>[])?.[0];

    const endTime = listingInfo?.endTime?.[0] ?? "";
    const dateStr = endTime ? endTime.slice(0, 10) : new Date().toISOString().slice(0, 10);

    return {
      itemId: (item.itemId as string[])?.[0] ?? "",
      title: (item.title as string[])?.[0] ?? "",
      price: parseFloat(currentPrice?.__value__ ?? "0"),
      currency: currentPrice?.["@currencyId"] ?? "USD",
      date: dateStr,
      condition: condition?.conditionDisplayName?.[0] ?? "",
      url: (item.viewItemURL as string[])?.[0] ?? "",
    };
  }).filter((listing: SoldListing) => listing.itemId && listing.price > 0);
}
```

- [ ] **Step 2: Manually test the Finding API**

Create a quick test script at the bottom of the file (remove after testing), or test via a temporary API route. Alternatively, test by running the cron endpoint in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ebay-finding.ts
git commit -m "Add eBay Finding API client for sold listings"
```

---

### Task 3: Add Browse API description fetcher

Fetch item descriptions from the Browse API to enrich listings before LLM classification.

**Files:**
- Create: `src/lib/ebay-browse.ts`

- [ ] **Step 1: Create `src/lib/ebay-browse.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ebay-browse.ts
git commit -m "Add Browse API description fetcher for listing enrichment"
```

---

### Task 4: Extract classification logic into shared module

Move the LLM classification logic out of the API route into a shared function, and add description support to the prompt.

**Files:**
- Create: `src/lib/price-classify.ts`
- Modify: `src/app/api/admin/price-classify/route.ts`

- [ ] **Step 1: Create `src/lib/price-classify.ts`**

```typescript
import { generateText, Output } from "ai";
import { z } from "zod";

export const ClassifiedListingSchema = z.object({
  listings: z.array(
    z.object({
      isRelevant: z.boolean().describe(
        "True only if: (1) this is the exact target camera model, (2) it's in working condition (not for parts/repair/broken/untested), (3) it's a single item (not a lot)",
      ),
      isBodyOnly: z.boolean().describe(
        "True if the listing is for the camera body only (no lens included)",
      ),
      includesLens: z.string().nullable().describe(
        "If a lens is included, describe it (e.g. 'FD 50mm f/1.8'). Null if body only.",
      ),
      conditionGrade: z.enum(["excellent", "good", "fair", "skip"]).describe(
        "Be strict — most cameras are 'good'. excellent: ONLY mint/near-mint/top-mint with zero caveats (10-20% of listings). good: the default for any working camera in decent shape — Exc+5, Very Good, tested, CLA'd, refurbished. fair: working but with noted issues, cosmetic damage, needs work, or vague condition claims. skip: broken, parts, untested.",
      ),
      conditionNotes: z.string().describe(
        "Brief notes about condition from the listing title",
      ),
      effectivePrice: z.number().describe(
        "The actual sale price in USD (not including shipping)",
      ),
    }),
  ),
});

export type ClassifiedListing = z.infer<typeof ClassifiedListingSchema>["listings"][number];

export interface RawListing {
  title: string;
  price: number;
  date: string;
  condition?: string;
  description?: string;
  url?: string;
}

const BATCH_SIZE = 20;

export async function classifyListings(
  cameraName: string,
  listings: RawListing[],
): Promise<ClassifiedListing[]> {
  const allClassified: ClassifiedListing[] = [];

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);

    const listingLines = batch.map((l, idx) => {
      let line = `${idx + 1}. "${l.title}" | $${l.price} | ${l.date} | ${l.condition || "unknown"}`;
      if (l.description) {
        line += `\n   Description: ${l.description.slice(0, 200)}`;
      }
      return line;
    }).join("\n");

    const prompt = `You are classifying eBay sold listings for the camera: "${cameraName}".

IMPORTANT RULES:
- Only mark isRelevant=true if the listing is for a WORKING "${cameraName}" (exact model, not a variant like "AE-1 Program" vs "AE-1").
- Mark isRelevant=false for: parts/repair, untested, broken, lots/bundles, different models, accessories only.
- conditionGrade "skip" should be used for anything not in working condition — these will be filtered out entirely.

Condition grading — be strict, most used cameras are "good", not "excellent":
- excellent: ONLY if explicitly described as mint, near-mint, [N MINT], [Top MINT], [MINT in Box], or collector grade. Must have no caveats. This is rare — maybe 10-20% of listings.
- good: The default for working cameras. Includes [Exc+5], [Exc+4], Excellent, Very Good, tested/working, CLA'd, Good Refurbished, Very Good Refurbished. Most listings should be here.
- fair: Any camera with caveats: *Read, cosmetic damage noted, "works but...", needs light seals, minor issues mentioned, no condition info given, just "body only" with no condition claim.

For each listing provide: isRelevant, isBodyOnly, includesLens, conditionGrade, conditionNotes, effectivePrice.

Listings:
${listingLines}`;

    try {
      const { output } = await generateText({
        model: "google/gemini-2.0-flash-lite",
        output: Output.object({ schema: ClassifiedListingSchema }),
        prompt,
      });

      if (output?.listings) {
        allClassified.push(...output.listings);
      }
    } catch (error) {
      console.error(`Classification error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
    }
  }

  return allClassified;
}
```

- [ ] **Step 2: Update `src/app/api/admin/price-classify/route.ts`**

Replace the inline logic with the shared function:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { classifyListings } from "@/lib/price-classify";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { cameraName, listings } = body as {
    cameraName: string;
    listings: { title: string; price: number; date: string; condition?: string }[];
  };

  if (!cameraName || !listings?.length) {
    return NextResponse.json({ error: "cameraName and listings required" }, { status: 400 });
  }

  try {
    const classified = await classifyListings(cameraName, listings);

    return NextResponse.json({
      cameraName,
      classified,
      raw: listings,
    });
  } catch (error) {
    console.error("Classification error:", error);
    return NextResponse.json(
      { error: "Classification failed", details: String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verify dev server starts and classification still works**

Run: `cd frontend && pnpm dev`

- [ ] **Step 4: Commit**

```bash
git add src/lib/price-classify.ts src/app/api/admin/price-classify/route.ts
git commit -m "Extract LLM classification into shared module with description support"
```

---

### Task 5: Create price pipeline storage and recompute logic

Port `store_classified_sales` and `recompute_price_estimates` from Python to TypeScript.

**Files:**
- Create: `src/lib/price-pipeline.ts`

- [ ] **Step 1: Create `src/lib/price-pipeline.ts`**

```typescript
import { db } from "@/db";
import { priceHistory, priceEstimates } from "@/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import type { ClassifiedListing, RawListing } from "@/lib/price-classify";

const GRADE_MAP: Record<string, string> = {
  excellent: "A",
  good: "B",
  fair: "C",
};

export async function storeClassifiedSales(
  entityType: string,
  entityId: number,
  classified: ClassifiedListing[],
  raw: RawListing[],
  extractedAt: string,
): Promise<number> {
  let stored = 0;

  for (let i = 0; i < classified.length; i++) {
    const cl = classified[i];
    const rawListing = raw[i];
    if (!rawListing) continue;

    if (!cl.isRelevant || cl.conditionGrade === "skip") continue;

    const condition = GRADE_MAP[cl.conditionGrade] ?? cl.conditionGrade;
    const sourceUrl = rawListing.url ?? null;

    // Check for duplicate
    if (sourceUrl) {
      const existing = await db
        .select({ id: priceHistory.id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.entityType, entityType),
            eq(priceHistory.entityId, entityId),
            eq(priceHistory.sourceUrl, sourceUrl),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;
    } else {
      const existing = await db
        .select({ id: priceHistory.id })
        .from(priceHistory)
        .where(
          and(
            eq(priceHistory.entityType, entityType),
            eq(priceHistory.entityId, entityId),
            eq(priceHistory.saleDate, rawListing.date),
            eq(priceHistory.priceUsd, Math.round(cl.effectivePrice)),
            eq(priceHistory.source, "eBay"),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;
    }

    await db.insert(priceHistory).values({
      entityType,
      entityId,
      saleDate: rawListing.date,
      condition,
      priceUsd: Math.round(cl.effectivePrice),
      source: "eBay",
      sourceUrl,
      extractedAt: new Date(extractedAt),
    });
    stored++;
  }

  return stored;
}

function computeRange(prices: number[]): [number | null, number | null] {
  if (prices.length === 0) return [null, null];
  prices.sort((a, b) => a - b);
  const n = prices.length;
  if (n === 1) return [prices[0], prices[0]];
  const lowIdx = Math.max(0, Math.floor(n * 0.25));
  const highIdx = Math.min(n - 1, Math.floor(n * 0.75));
  return [prices[lowIdx], prices[highIdx]];
}

export async function recomputePriceEstimates(
  entityType: string,
  entityId: number,
): Promise<void> {
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const rows = await db
    .select({
      condition: priceHistory.condition,
      priceUsd: priceHistory.priceUsd,
      saleDate: priceHistory.saleDate,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.entityType, entityType),
        eq(priceHistory.entityId, entityId),
        gt(priceHistory.priceUsd, 0),
        sql`${priceHistory.saleDate} >= ${twoYearsAgo.toISOString().slice(0, 10)}`,
      ),
    );

  if (rows.length === 0) return;

  // Bucket by condition
  const buckets: Record<string, number[]> = { excellent: [], good: [], fair: [] };

  for (const row of rows) {
    const price = row.priceUsd!;
    const cond = row.condition ?? "";
    if (["A", "A+", "A-B"].includes(cond)) {
      buckets.excellent.push(price);
    } else if (["B", "B+", "B-A"].includes(cond)) {
      buckets.good.push(price);
    } else {
      buckets.fair.push(price);
    }
  }

  let [avgLow, avgHigh] = computeRange(buckets.fair);
  let [vgLow, vgHigh] = computeRange(buckets.good);
  let [mintLow, mintHigh] = computeRange(buckets.excellent);

  // Fallback: estimate empty buckets from overall distribution
  const allPrices = rows.map((r) => r.priceUsd!).sort((a, b) => a - b);
  if (buckets.fair.length === 0 && allPrices.length > 0) {
    avgLow = allPrices[Math.floor(allPrices.length * 0.15)];
    avgHigh = allPrices[Math.floor(allPrices.length * 0.40)];
  }
  if (buckets.good.length === 0 && allPrices.length > 0) {
    vgLow = allPrices[Math.floor(allPrices.length * 0.40)];
    vgHigh = allPrices[Math.floor(allPrices.length * 0.65)];
  }
  if (buckets.excellent.length === 0 && allPrices.length > 0) {
    mintLow = allPrices[Math.floor(allPrices.length * 0.75)];
    mintHigh = allPrices[Math.min(allPrices.length - 1, Math.floor(allPrices.length * 0.95))];
  }

  // Median: prefer 90-day window if enough data
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentRows = await db
    .select({ priceUsd: priceHistory.priceUsd })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.entityType, entityType),
        eq(priceHistory.entityId, entityId),
        gt(priceHistory.priceUsd, 0),
        sql`${priceHistory.saleDate} >= ${ninetyDaysAgo.toISOString().slice(0, 10)}`,
      ),
    );

  const recentPrices = recentRows.map((r) => r.priceUsd!).sort((a, b) => a - b);
  const medianSource = recentPrices.length >= 5 ? recentPrices : allPrices;
  const medianPrice = medianSource.length > 0
    ? medianSource[Math.floor(medianSource.length / 2)]
    : null;

  // Rarity from 90-day volume
  const recentCount = recentRows.length;
  let rarity: string;
  if (recentCount >= 20) rarity = "Very common";
  else if (recentCount >= 10) rarity = "Common";
  else if (recentCount >= 4) rarity = "Somewhat rare";
  else if (recentCount >= 1) rarity = "Very scarce";
  else rarity = "Extremely rare";

  const now = new Date();

  await db
    .insert(priceEstimates)
    .values({
      entityType,
      entityId,
      sourceName: "eBay",
      priceAverageLow: avgLow,
      priceAverageHigh: avgHigh,
      priceVeryGoodLow: vgLow,
      priceVeryGoodHigh: vgHigh,
      priceMintLow: mintLow,
      priceMintHigh: mintHigh,
      medianPrice,
      rarity,
      rarityVotes: recentCount,
      extractedAt: now,
    })
    .onConflictDoUpdate({
      target: [priceEstimates.entityType, priceEstimates.entityId],
      set: {
        sourceName: "eBay",
        priceAverageLow: avgLow,
        priceAverageHigh: avgHigh,
        priceVeryGoodLow: vgLow,
        priceVeryGoodHigh: vgHigh,
        priceMintLow: mintLow,
        priceMintHigh: mintHigh,
        medianPrice,
        rarity,
        rarityVotes: recentCount,
        extractedAt: now,
      },
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/price-pipeline.ts
git commit -m "Add price pipeline storage and recompute logic"
```

---

### Task 6: Create the cron endpoint

Wire everything together into the cron handler.

**Files:**
- Create: `src/app/api/cron/ebay-prices/route.ts`

- [ ] **Step 1: Create `src/app/api/cron/ebay-prices/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cameras, priceEstimates } from "@/db/schema";
import { sql, isNull, asc, desc } from "drizzle-orm";
import { searchSoldItems } from "@/lib/ebay-finding";
import { enrichListingsWithDescriptions } from "@/lib/ebay-browse";
import { classifyListings } from "@/lib/price-classify";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 30;

async function getCameraBatch(): Promise<{ id: number; name: string }[]> {
  const rows = await db
    .select({
      id: cameras.id,
      name: cameras.name,
      extractedAt: priceEstimates.extractedAt,
    })
    .from(cameras)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'camera' AND ${priceEstimates.entityId} = ${cameras.id}`,
    )
    .where(isNull(cameras.mergedIntoId))
    .orderBy(
      asc(priceEstimates.extractedAt).nullsFirst(),
      desc(cameras.viewCount),
    )
    .limit(BATCH_SIZE);

  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const cameraBatch = await getCameraBatch();
  const results: { name: string; listings: number; relevant: number; stored: number }[] = [];
  let totalStored = 0;

  for (const camera of cameraBatch) {
    try {
      // 1. Fetch sold listings
      const soldListings = await searchSoldItems(camera.name);
      if (soldListings.length === 0) {
        results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
        continue;
      }

      // 2. Enrich with descriptions
      const enrichedListings = await enrichListingsWithDescriptions(soldListings);

      // 3. Classify via LLM
      const rawForClassify = enrichedListings.map((l) => ({
        title: l.title,
        price: l.price,
        date: l.date,
        condition: l.condition,
        description: l.description,
      }));
      const classified = await classifyListings(camera.name, rawForClassify);

      // 4. Store classified sales
      const rawForStorage = enrichedListings.map((l) => ({
        title: l.title,
        price: l.price,
        date: l.date,
        condition: l.condition,
        url: l.url,
      }));
      const extractedAt = new Date().toISOString();
      const stored = await storeClassifiedSales(
        "camera",
        camera.id,
        classified,
        rawForStorage,
        extractedAt,
      );

      // 5. Recompute price estimates
      if (stored > 0) {
        await recomputePriceEstimates("camera", camera.id);
      }

      const relevant = classified.filter(
        (c) => c.isRelevant && c.conditionGrade !== "skip",
      ).length;
      totalStored += stored;
      results.push({ name: camera.name, listings: soldListings.length, relevant, stored });
    } catch (error) {
      console.error(`Error processing ${camera.name}:`, error);
      results.push({ name: camera.name, listings: 0, relevant: 0, stored: 0 });
    }
  }

  const durationMs = Date.now() - startTime;

  return NextResponse.json({
    processed: cameraBatch.length,
    totalStored,
    cameras: results,
    durationMs,
  });
}
```

- [ ] **Step 2: Verify the dev server starts**

Run: `cd frontend && pnpm dev`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/ebay-prices/route.ts
git commit -m "Add cron endpoint for daily eBay price pipeline"
```

---

### Task 7: Add Vercel cron configuration

Configure the cron schedule.

**Files:**
- Create: `frontend/vercel.json`

- [ ] **Step 1: Create `frontend/vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/ebay-prices",
      "schedule": "0 6 * * *"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "Add Vercel cron schedule for daily eBay price pipeline"
```

---

### Task 8: End-to-end test with a single camera

Manually trigger the cron endpoint locally to validate the full pipeline.

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && pnpm dev`

- [ ] **Step 2: Trigger the endpoint for a single camera**

Temporarily reduce `BATCH_SIZE` to 1 in `route.ts`, or test by calling:

```bash
curl -s "http://localhost:3000/api/cron/ebay-prices" | jq .
```

Verify the response includes:
- `processed: 1` (or more)
- A camera entry with `listings > 0`, `relevant > 0`, `stored > 0`
- `durationMs` is reasonable (under 30s for a single camera)

- [ ] **Step 3: Verify data was stored**

Check the database directly:

```bash
psql "$DATABASE_URL" -c "SELECT * FROM price_history ORDER BY extracted_at DESC LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT * FROM price_estimates ORDER BY extracted_at DESC LIMIT 5;"
```

- [ ] **Step 4: Restore `BATCH_SIZE` to 30 if you changed it**

- [ ] **Step 5: Verify build passes**

Run: `cd frontend && pnpm build`

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "Fix issues found during end-to-end testing"
```
