# eBay Lens Price Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape eBay sold listings for lenses daily, classify them with an LLM, and store price history + estimates — mirroring the existing camera pipeline.

**Architecture:** Four new files, no changes to existing files. The storage layer (`storeClassifiedSales`, `recomputePriceEstimates`) already supports `entityType: "lens"`. New code covers: API route to serve/receive lens batches, lens-specific LLM classifier, scraper script, and GitHub Actions workflow.

**Tech Stack:** Next.js API routes, Drizzle ORM, Vercel AI SDK with Gemini 2.0 Flash Lite, Playwright, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-16-ebay-lens-price-pipeline-design.md`

---

### Task 1: Lens Classification Function

**Files:**
- Create: `frontend/src/lib/price-classify-lens.ts`

- [ ] **Step 1: Create the lens classification schema and function**

Create `frontend/src/lib/price-classify-lens.ts`:

```typescript
import { generateText, Output } from "ai";
import { z } from "zod";

export const ClassifiedLensListingSchema = z.object({
  listings: z.array(
    z.object({
      isRelevant: z.boolean().describe(
        "True only if: (1) this is the exact target lens model (correct focal length, aperture, brand, mount), (2) it's in working condition (not for parts/repair/broken/untested), (3) it's a single item (not a lot/bundle)",
      ),
      isLensOnly: z.boolean().describe(
        "True if the listing is for the lens only (no camera body bundled)",
      ),
      conditionGrade: z.enum(["excellent", "good", "fair", "skip"]).describe(
        "Be strict — most lenses are 'good'. excellent: ONLY mint/near-mint/top-mint with zero caveats (10-20% of listings). good: the default for any working lens in decent shape — clean optics, smooth focus and aperture. fair: working but with cosmetic issues, minor dust not affecting images, stiff focus, oil on aperture blades. skip: fungus, mold, haze, scratches on elements, separation, cloudy/foggy optics, broken, parts, untested.",
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

export type ClassifiedLensListing = z.infer<typeof ClassifiedLensListingSchema>["listings"][number];

const BATCH_SIZE = 20;

export async function classifyLensListings(
  lensName: string,
  listings: { title: string; price: number; date: string; condition?: string; description?: string; url?: string }[],
): Promise<ClassifiedLensListing[]> {
  const allClassified: ClassifiedLensListing[] = [];

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);

    const listingLines = batch.map((l, idx) => {
      let line = `${idx + 1}. "${l.title}" | $${l.price} | ${l.date} | ${l.condition || "unknown"}`;
      if (l.description) {
        line += `\n   Description: ${l.description.slice(0, 200)}`;
      }
      return line;
    }).join("\n");

    const prompt = `You are classifying eBay sold listings for the lens: "${lensName}".

IMPORTANT RULES:
- Only mark isRelevant=true if the listing is for a WORKING "${lensName}" (exact model — correct focal length, aperture, brand, and mount).
- Mark isRelevant=false for: different focal length, different aperture, different brand/mount, bundled with a camera body, parts/repair, untested, broken, lots/bundles, accessories only.
- conditionGrade "skip" should be used for anything not in usable optical condition — these will be filtered out entirely.

Condition grading — be strict, most used lenses are "good", not "excellent":
- excellent: ONLY if explicitly described as mint, near-mint, [N MINT], [Top MINT], [MINT in Box], or collector grade. Must have no caveats. This is rare — maybe 10-20% of listings.
- good: The default for working lenses. Includes [Exc+5], [Exc+4], Excellent, Very Good, tested/working, clean optics, smooth focus and aperture. Most listings should be here.
- fair: Any lens with caveats: cosmetic damage noted, minor dust (not affecting images), stiff focus ring, oil on aperture blades, no condition info given.
- skip: MUST skip if any of these optical defects are mentioned: fungus, mold, haze, scratches on lens elements, separation, cloudy optics, foggy optics, heavy dust. Also skip: broken, for parts, untested.

For each listing provide: isRelevant, isLensOnly, conditionGrade, conditionNotes, effectivePrice.

Listings:
${listingLines}`;

    try {
      const { output } = await generateText({
        model: "google/gemini-2.0-flash-lite",
        output: Output.object({ schema: ClassifiedLensListingSchema }),
        prompt,
      });

      if (output?.listings) {
        allClassified.push(...output.listings);
      }
    } catch (error) {
      console.error(`Lens classification error (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
    }
  }

  return allClassified;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd frontend && npx tsc --noEmit src/lib/price-classify-lens.ts`

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/price-classify-lens.ts
git commit -m "Add lens-specific eBay listing classifier"
```

---

### Task 2: API Route for Lens Price Pipeline

**Files:**
- Create: `frontend/src/app/api/cron/ebay-lens-prices/route.ts`

- [ ] **Step 1: Create the API route**

Create `frontend/src/app/api/cron/ebay-lens-prices/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, priceEstimates } from "@/db/schema";
import { sql, isNull, desc } from "drizzle-orm";
import type { EbayListing } from "@/lib/ebay-types";
import type { ClassifiedListing } from "@/lib/price-classify";
import { classifyLensListings } from "@/lib/price-classify-lens";
import { storeClassifiedSales, recomputePriceEstimates } from "@/lib/price-pipeline";

const BATCH_SIZE = 400;

async function getLensBatch(): Promise<{ id: number; name: string }[]> {
  const rows = await db
    .select({
      id: lenses.id,
      name: lenses.name,
      extractedAt: priceEstimates.extractedAt,
    })
    .from(lenses)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'lens' AND ${priceEstimates.entityId} = ${lenses.id}`,
    )
    .where(isNull(lenses.mergedIntoId))
    .orderBy(
      sql`${priceEstimates.extractedAt} ASC NULLS FIRST`,
      desc(lenses.viewCount),
    )
    .limit(BATCH_SIZE);

  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function getLensRotationStats(staleBefore?: Date) {
  const [{ totalActiveLenses: totalActiveLensesRaw }] = await db
    .select({
      totalActiveLenses: sql<number>`count(*)`,
    })
    .from(lenses)
    .where(isNull(lenses.mergedIntoId));

  const totalActiveLenses = Number(totalActiveLensesRaw);

  if (!staleBefore) {
    return {
      batchSize: BATCH_SIZE,
      totalActiveLenses,
    };
  }

  const [{ outdatedLenses: outdatedLensesRaw }] = await db
    .select({
      outdatedLenses: sql<number>`count(*)`,
    })
    .from(lenses)
    .leftJoin(
      priceEstimates,
      sql`${priceEstimates.entityType} = 'lens' AND ${priceEstimates.entityId} = ${lenses.id}`,
    )
    .where(
      sql`${lenses.mergedIntoId} IS NULL AND (
        ${priceEstimates.extractedAt} IS NULL OR ${priceEstimates.extractedAt} < ${staleBefore}
      )`,
    );

  const outdatedLenses = Number(outdatedLensesRaw);

  return {
    batchSize: BATCH_SIZE,
    totalActiveLenses,
    outdatedLenses,
    estimatedRunsRemaining: Math.ceil(outdatedLenses / BATCH_SIZE),
  };
}

export const maxDuration = 300;

/**
 * GET: Returns the next batch of lenses that need price updates.
 * Called by GitHub Action to know which lenses to scrape.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleBeforeRaw = request.nextUrl.searchParams.get("staleBefore");
  let staleBefore: Date | undefined;

  if (staleBeforeRaw) {
    staleBefore = new Date(staleBeforeRaw);
    if (Number.isNaN(staleBefore.getTime())) {
      return NextResponse.json({ error: "Invalid staleBefore timestamp" }, { status: 400 });
    }
  }

  const lensBatch = await getLensBatch();
  const stats = await getLensRotationStats(staleBefore);

  return NextResponse.json({ lenses: lensBatch, stats });
}

/**
 * POST: Receives scraped listings for a single lens, classifies, stores, recomputes.
 * Called by GitHub Action after scraping each lens.
 *
 * Body: { lensId: number, lensName: string, listings: EbayListing[] }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { lensId, lensName, listings } = body as {
    lensId: number;
    lensName: string;
    listings: EbayListing[];
  };

  if (!lensId || !lensName) {
    return NextResponse.json({ error: "lensId and lensName required" }, { status: 400 });
  }

  console.log(`[ebay-lens-prices] Processing ${lensName}: ${listings?.length ?? 0} listings`);

  try {
    let stored = 0;
    let relevant = 0;

    if (listings?.length) {
      const classified = await classifyLensListings(lensName, listings);
      const extractedAt = new Date().toISOString();
      // Cast: storeClassifiedSales only uses isRelevant, conditionGrade, effectivePrice
      stored = await storeClassifiedSales(
        "lens",
        lensId,
        classified as unknown as ClassifiedListing[],
        listings,
        extractedAt,
      );
      relevant = classified.filter(
        (c) => c.isRelevant && c.conditionGrade !== "skip",
      ).length;
    }

    // Always upsert price_estimates to mark this lens as scraped
    // (even with 0 listings/stored, so we don't re-scrape it next run)
    await recomputePriceEstimates("lens", lensId);

    console.log(`[ebay-lens-prices]   ${lensName}: Relevant: ${relevant}, Stored: ${stored}`);

    return NextResponse.json({ lensName, listings: listings?.length ?? 0, relevant, stored });
  } catch (error) {
    console.error(`[ebay-lens-prices] Error processing ${lensName}:`, error);
    return NextResponse.json(
      { error: "Processing failed", details: String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd frontend && npx tsc --noEmit src/app/api/cron/ebay-lens-prices/route.ts`

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/cron/ebay-lens-prices/route.ts
git commit -m "Add API route for eBay lens price pipeline"
```

---

### Task 3: Scraper Script

**Files:**
- Create: `scraper/ebay-lens-scrape-action.mjs`

- [ ] **Step 1: Create the scraper script**

Create `scraper/ebay-lens-scrape-action.mjs`:

```javascript
/**
 * eBay Lens Price Scraper — runs as a GitHub Action.
 *
 * 1. GET /api/cron/ebay-lens-prices → get batch of lenses needing price updates
 * 2. For each lens: scrape eBay sold listings with Playwright
 * 3. POST /api/cron/ebay-lens-prices → send listings for LLM classification + storage
 */

import { chromium } from "playwright-core";

const API_URL = process.env.API_URL || "https://thelensdb.com";
const CRON_SECRET = process.env.CRON_SECRET;
const DELAY_BETWEEN_LENSES_MS = 2000;

const MONTHS = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04",
  May: "05", Jun: "06", Jul: "07", Aug: "08",
  Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSearchQuery(lensName) {
  // Strip parenthesized content
  return lensName.replace(/\s*\([^)]*\)/g, "").trim();
}

async function getLensBatch() {
  return getLensBatchState();
}

async function getLensBatchState(staleBefore) {
  const headers = {};
  if (CRON_SECRET) headers["Authorization"] = `Bearer ${CRON_SECRET}`;

  const url = new URL(`${API_URL}/api/cron/ebay-lens-prices`);
  if (staleBefore) {
    url.searchParams.set("staleBefore", staleBefore);
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to get lens batch: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function submitListings(lensId, lensName, listings) {
  const res = await fetch(`${API_URL}/api/cron/ebay-lens-prices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
    },
    body: JSON.stringify({ lensId, lensName, listings }),
  });
  if (!res.ok) {
    console.error(`  Failed to submit: ${res.status}`);
    return { relevant: 0, stored: 0 };
  }
  return res.json();
}

async function scrapeSoldListings(page, lensName) {
  const query = buildSearchQuery(lensName);
  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "625",
    LH_Sold: "1",
    LH_Complete: "1",
    _sop: "13",
    _ipg: "60",
  });

  const url = `https://www.ebay.com/sch/i.html?${params}`;

  await page.goto(url, { waitUntil: "load", timeout: 20000 });

  // Wait for listing cards to render
  try {
    await page.waitForSelector(".s-card__title", { timeout: 8000 });
  } catch {
    return [];
  }

  return page.evaluate((months) => {
    const cards = document.querySelectorAll(".su-card-container");
    const results = [];

    for (const card of cards) {
      const titleEl = card.querySelector(".s-card__title .su-styled-text");
      if (!titleEl || titleEl.textContent?.includes("Shop on eBay")) continue;

      const captionEl = card.querySelector(".s-card__caption .su-styled-text");
      const soldText = captionEl?.textContent?.trim() ?? "";
      const soldMatch = soldText.match(/Sold\s+(\w+)\s+(\d+),\s+(\d+)/);
      if (!soldMatch) continue;

      const month = months[soldMatch[1]] ?? "01";
      const day = soldMatch[2].padStart(2, "0");
      const year = soldMatch[3];
      const date = `${year}-${month}-${day}`;

      const title = (titleEl.textContent ?? "")
        .replace("Opens in a new window or tab", "")
        .trim()
        .slice(0, 120);
      if (!title) continue;

      const priceEl = card.querySelector(
        ".su-card-container__attributes__primary .s-card__attribute-row:first-child .su-styled-text"
      );
      const priceText = priceEl?.textContent?.trim() ?? "";
      const priceMatch = priceText.match(/([\d,]+\.\d{2})/);
      if (!priceMatch) continue;
      const price = parseFloat(priceMatch[1].replace(",", ""));
      if (price <= 0) continue;

      const condEl = card.querySelector(".s-card__subtitle .su-styled-text");
      const condition = condEl?.textContent?.trim() ?? "";

      const linkEl = card.querySelector("a.s-card__link");
      const href = linkEl?.getAttribute("href") ?? "";
      const itemIdMatch = href.match(/\/itm\/(\d+)/);
      if (!itemIdMatch) continue;

      results.push({
        itemId: itemIdMatch[1],
        title,
        price,
        currency: "USD",
        date,
        condition,
        url: `https://www.ebay.com/itm/${itemIdMatch[1]}`,
      });
    }

    return results.slice(0, 20);
  }, MONTHS);
}

async function main() {
  if (!CRON_SECRET) {
    console.warn("Warning: CRON_SECRET not set — requests will be unauthenticated");
  }

  const rotationStartedAt = new Date().toISOString();
  console.log(`Fetching lens batch from ${API_URL}...`);
  const batchState = await getLensBatch();
  const lenses = batchState.lenses;
  console.log(`Got ${lenses.length} lenses to process\n`);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  let totalStored = 0;

  for (let i = 0; i < lenses.length; i++) {
    const lens = lenses[i];
    if (i > 0) await delay(DELAY_BETWEEN_LENSES_MS);

    let listings = [];
    try {
      listings = await scrapeSoldListings(page, lens.name);
    } catch (error) {
      console.error(`  Error scraping: ${error.message}`);
    }

    console.log(`${i + 1}/${lenses.length} ${lens.name}: ${listings.length} listings`);

    // Always submit to API — even with 0 listings, so the lens is marked as scraped
    // and gets rotated out of the "never-scraped" priority queue
    try {
      const result = await submitListings(lens.id, lens.name, listings);
      if (listings.length > 0) {
        console.log(`  Relevant: ${result.relevant}, Stored: ${result.stored}`);
      }
      totalStored += result.stored || 0;
    } catch (error) {
      console.error(`  Error submitting: ${error.message}`);
    }
  }

  await browser.close();
  console.log(`\nDone: ${lenses.length} lenses, ${totalStored} stored`);

  try {
    const finalState = await getLensBatchState(rotationStartedAt);
    const stats = finalState.stats;
    if (stats?.outdatedLenses !== undefined) {
      console.log(
        `Rotation remaining: ${stats.outdatedLenses} lenses with outdated data ` +
        `(~${stats.estimatedRunsRemaining} runs left at ${stats.batchSize}/run)`
      );
    }
  } catch (error) {
    console.warn(`Could not fetch rotation stats: ${error.message}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the script parses**

Run: `node --check scraper/ebay-lens-scrape-action.mjs`

Expected: no output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add scraper/ebay-lens-scrape-action.mjs
git commit -m "Add eBay lens price scraper script"
```

---

### Task 4: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/ebay-lens-prices.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/ebay-lens-prices.yml`:

```yaml
name: eBay Lens Price Pipeline

on:
  schedule:
    # Daily at noon UTC (cameras run at 6 AM UTC)
    - cron: "0 12 * * *"
  workflow_dispatch: # Allow manual trigger

jobs:
  scrape-and-classify:
    runs-on: ubuntu-latest
    environment: production
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: 24

      - name: Install script dependencies
        run: cd scraper && npm install playwright-core

      - name: Run eBay lens price scraper
        env:
          API_URL: ${{ secrets.API_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: node scraper/ebay-lens-scrape-action.mjs
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ebay-lens-prices.yml'))" && echo "Valid YAML"`

Expected: `Valid YAML`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ebay-lens-prices.yml
git commit -m "Add GitHub Actions workflow for eBay lens price pipeline"
```

---

### Task 5: Build Verification

- [ ] **Step 1: Run the full build to verify everything compiles**

Run: `cd frontend && pnpm build`

Expected: build succeeds with no errors

- [ ] **Step 2: Verify no lint errors in new files**

Run: `cd frontend && pnpm lint`

Expected: no new errors
