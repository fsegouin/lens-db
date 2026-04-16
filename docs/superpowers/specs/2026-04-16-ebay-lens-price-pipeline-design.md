# eBay Lens Price Pipeline

Extend the existing eBay price scraping infrastructure to cover lenses, mirroring the camera pipeline with lens-specific classification.

## Context

The camera price pipeline scrapes eBay sold listings daily via a GitHub Action, classifies them with an LLM, and stores price history + estimates. The storage layer (`priceHistory`, `priceEstimates`, `storeClassifiedSales`, `recomputePriceEstimates`) already supports `entityType: "lens"`. What's missing is the scraping, classification, and API layer for lenses.

~7,400 lenses in the database. At 400/batch with daily runs, a full rotation takes ~18 days.

## Architecture

Four new files, no changes to existing files:

```
.github/workflows/ebay-lens-prices.yml    # New workflow
scraper/ebay-lens-scrape-action.mjs        # New scraper script
frontend/src/app/api/cron/ebay-lens-prices/route.ts  # New API route
frontend/src/lib/price-classify-lens.ts    # New lens classifier
```

Reuses without modification:
- `frontend/src/lib/price-pipeline.ts` — `storeClassifiedSales("lens", ...)` and `recomputePriceEstimates("lens", ...)`
- `frontend/src/db/schema.ts` — `priceEstimates` and `priceHistory` tables already support `entityType: "lens"`

## 1. API Route: `api/cron/ebay-lens-prices/route.ts`

Mirrors `api/cron/ebay-prices/route.ts` (camera version).

### GET — Fetch lens batch

- Query `lenses` table, `LEFT JOIN priceEstimates` on `entityType = 'lens'`
- Filter: `mergedIntoId IS NULL`
- Order: `extractedAt ASC NULLS FIRST`, then `viewCount DESC`
- Limit: 400 (`BATCH_SIZE`)
- Returns: `{ lenses: [{ id, name }], stats: { batchSize, totalActiveLenses, outdatedLenses?, estimatedRunsRemaining? } }`

No `alias` field on lenses (unlike cameras).

### POST — Receive + classify + store listings for one lens

- Body: `{ lensId, lensName, listings: EbayListing[] }`
- Classifies via `classifyLensListings` (new function)
- Stores via `storeClassifiedSales("lens", lensId, ...)`
- Recomputes via `recomputePriceEstimates("lens", lensId)`
- Always upserts `priceEstimates` to mark the lens as scraped, even with 0 listings
- Auth: `Bearer CRON_SECRET` header

## 2. Lens Classification: `price-classify-lens.ts`

### Schema (`ClassifiedLensListingSchema`)

```typescript
z.object({
  listings: z.array(z.object({
    isRelevant: z.boolean(),     // exact target lens model, working condition, single item
    isLensOnly: z.boolean(),     // true if lens only, no camera body bundled
    conditionGrade: z.enum(["excellent", "good", "fair", "skip"]),
    conditionNotes: z.string(),
    effectivePrice: z.number(),
  })),
})
```

Differences from camera schema: no `isBodyOnly`, no `includesLens`, added `isLensOnly`.

### Prompt

Key rules for the LLM:
- **Relevance**: exact lens model only (correct focal length, aperture, brand, mount). Irrelevant if: different model, bundled with camera body, parts/repair, lot/bundle, accessories only.
- **Skip condition**: fungus, haze, mold, heavy dust, scratches on optical elements, separation, cloudy/foggy optics. These are lens-specific defects that make the item unusable.
- **Condition grading** (same scale as cameras):
  - `excellent`: mint/near-mint, zero caveats (10-20% of listings)
  - `good`: default for working lenses in decent shape — clean optics, smooth focus/aperture
  - `fair`: working but with cosmetic issues, minor dust (not affecting images), stiff focus, oil on aperture blades
  - `skip`: fungus, mold, haze, scratches, separation, broken, parts, untested
- **Model**: Gemini 2.0 Flash Lite (same as cameras)
- **Batch size**: 20 listings per LLM call (same as cameras)

## 3. Scraper Script: `ebay-lens-scrape-action.mjs`

Mirrors `ebay-scrape-action.mjs`. Differences:

- Fetches from `/api/cron/ebay-lens-prices` (GET) and posts back to the same endpoint (POST)
- `buildSearchQuery`: strips parenthesized content only (minimal cleanup)
- No alias fallback (lenses don't have aliases)
- Same eBay search: category `625`, sold/complete, sorted by recent, 60 results, take top 20
- Same delays: 2s between lenses
- Same Playwright/Chrome setup, user agent, selectors, date parsing

## 4. GitHub Actions Workflow: `ebay-lens-prices.yml`

```yaml
name: eBay Lens Price Pipeline

on:
  schedule:
    - cron: "0 12 * * *"   # Daily at noon UTC (cameras run at 6 AM)
  workflow_dispatch:

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

Same secrets as the camera workflow — no new secrets needed.
