# eBay Cron Price Pipeline

Replaces the Python scripts (`batch_ebay_prices.py` + `process_ebay_prices.py`) with a TypeScript cron endpoint inside the Next.js app. Runs daily on Vercel, rotates through all cameras in batches, fetches sold eBay listings via the Finding API, enriches with descriptions via the Browse API, classifies with the existing LLM endpoint, and stores results.

## Endpoint

`GET /api/cron/ebay-prices`

Secured via `CRON_SECRET` header verification (Vercel cron standard).

## Pipeline per camera

```
1. Finding API: findCompletedItems(camera name) → sold listings (title, price, date, condition, itemId, URL)
2. Browse API: getItem(itemId) per listing → fetch description
3. LLM classify: call price-classify logic with title + description + price + date + condition
4. Store: insert relevant classified sales into price_history (dedup by source_url)
5. Recompute: recalculate price_estimates from price_history (percentile ranges, median, rarity)
```

## Camera rotation

No extra state tracking. The rotation is derived from existing data:

```sql
-- Priority 1: cameras never processed (no price_estimates row)
-- Priority 2: cameras with oldest extracted_at (most stale)
SELECT c.id, c.name
FROM cameras c
LEFT JOIN price_estimates pe
  ON pe.entity_type = 'camera' AND pe.entity_id = c.id
WHERE c.merged_into_id IS NULL
ORDER BY
  pe.extracted_at ASC NULLS FIRST,
  c.view_count DESC NULLS LAST
LIMIT :batch_size
```

Batch size: 30 cameras per run (tunable). With ~40 listings per camera and a 10-minute Vercel function limit, this is conservative. Each camera requires:
- 1 Finding API call (~200ms)
- ~40 Browse API `getItem` calls (~200ms each, parallelizable)
- 1 LLM classification call (~2-5s)
- DB writes (~50ms)

Estimated per camera: ~5-10s with parallelized `getItem` calls. 30 cameras = ~3-5 minutes.

## eBay Finding API

- **Endpoint**: `https://svcs.ebay.com/services/search/FindingService/v1`
- **Auth**: `SECURITY-APPNAME` query param = `EBAY_APP_ID` (no OAuth needed)
- **Operation**: `findCompletedItems`
- **Rate limit**: 5000 calls/day
- **Response format**: JSON

### Request parameters

| Parameter | Value |
|-----------|-------|
| `OPERATION-NAME` | `findCompletedItems` |
| `SERVICE-VERSION` | `1.13.0` |
| `SECURITY-APPNAME` | `EBAY_APP_ID` env var |
| `RESPONSE-DATA-FORMAT` | `JSON` |
| `REST-PAYLOAD` | (empty) |
| `keywords` | `{camera name} camera body` |
| `categoryId` | `625` (Film Cameras) |
| `itemFilter(0).name` | `SoldItemsOnly` |
| `itemFilter(0).value` | `true` |
| `itemFilter(1).name` | `ListingType` |
| `itemFilter(1).value` | `FixedPrice,AuctionWithBIN,Auction` |
| `sortOrder` | `EndTimeSoonest` |
| `paginationInput.entriesPerPage` | `50` |

### Search query building

Same logic as the Python script:
- Strip common prefixes that hurt search: "Asahi ", "Nippon Kogaku "
- Append "camera body" to focus on body-only listings

### Response fields used

From `findCompletedItemsResponse.searchResult.item[]`:
- `itemId` — used to fetch description via Browse API
- `title` — listing title
- `sellingStatus.currentPrice` — final sale price + currency
- `listingInfo.endTime` — sale date
- `condition.conditionDisplayName` — condition text (e.g., "Used", "For parts or not working")
- `viewItemURL` — stored as `source_url` in price_history

## eBay Browse API (description enrichment)

- **Endpoint**: `https://api.ebay.com/buy/browse/v1/item/{itemId}`
- **Auth**: Bearer token via OAuth2 client credentials (reuse existing `getEbayAccessToken()` from `/api/ebay-listings`)
- **Fields used**: `shortDescription` or `description` (HTML — strip tags for LLM)

The existing OAuth token caching logic in `ebay-listings/route.ts` will be extracted into a shared module.

Note: The Finding API returns legacy-format item IDs. The Browse API requires v1-format IDs (`v1|{itemId}|0`). We'll convert accordingly.

## LLM classification

Reuse the existing classification logic from `/api/admin/price-classify/route.ts` as a direct function call (not HTTP). The prompt and schema stay the same, with one addition: the listing description is now included in the prompt for each listing.

Updated listing format in the prompt:
```
1. "{title}" | ${price} | {date} | {condition}
   Description: {stripped description text, truncated to 200 chars}
```

Batch size: 20 listings per LLM call (same as current).

## Storage: `price_history`

Port `store_classified_sales` from Python to TypeScript using Drizzle ORM.

For each classified listing where `isRelevant=true` and `conditionGrade != "skip"`:
1. Map grade to condition code: excellent=A, good=B, fair=C
2. Check for duplicate by `source_url` (or by entity+date+price if no URL)
3. Insert into `price_history`

## Recompute: `price_estimates`

Port `recompute_price_estimates` from Python to TypeScript using Drizzle ORM.

Logic (unchanged from Python):
1. Fetch all sales from last 2 years for the entity
2. Bucket by condition: A→excellent, B→good, C→fair
3. Compute 25th-75th percentile range per bucket
4. If a bucket is empty, estimate from overall distribution
5. Median price: prefer 90-day window (if >= 5 sales), else use all
6. Rarity: count 90-day sales → scale (20+=Very common, 10-19=Common, 4-9=Somewhat rare, 1-3=Very scarce)
7. Upsert into `price_estimates`

## New files

| File | Purpose |
|------|---------|
| `src/app/api/cron/ebay-prices/route.ts` | Cron handler — orchestrates the pipeline |
| `src/lib/ebay-finding.ts` | Finding API client — `searchSoldItems(query)` |
| `src/lib/ebay-auth.ts` | Shared OAuth token logic (extracted from `ebay-listings/route.ts`) |
| `src/lib/price-pipeline.ts` | `classifyListings()`, `storeClassifiedSales()`, `recomputePriceEstimates()` |
| `vercel.json` | Cron schedule configuration |

## Modified files

| File | Change |
|------|--------|
| `src/app/api/ebay-listings/route.ts` | Extract OAuth logic into `src/lib/ebay-auth.ts`, switch from `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` to `EBAY_APP_ID`/`EBAY_CERT_ID` |
| `src/app/api/admin/price-classify/route.ts` | Extract classification logic into a shared function in `src/lib/price-pipeline.ts`, route calls the shared function |

## Vercel cron config

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

Runs daily at 6:00 AM UTC.

## Environment variables

| Variable | Purpose | Status |
|----------|---------|--------|
| `EBAY_APP_ID` | Finding API auth + Browse API OAuth client ID | Already set (production) |
| `EBAY_CERT_ID` | Browse API OAuth client secret | Already set (production) |
| `CRON_SECRET` | Vercel cron auth | Auto-set by Vercel |

The existing `/api/ebay-listings` route uses `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`. As part of this work, we'll update it to use `EBAY_APP_ID`/`EBAY_CERT_ID` instead, so there's a single set of env var names for all eBay API calls.

## Logging

The cron endpoint returns a JSON summary:

```json
{
  "processed": 30,
  "totalStored": 142,
  "cameras": [
    { "name": "Canon AE-1", "listings": 42, "relevant": 18, "stored": 12 },
    ...
  ],
  "durationMs": 245000
}
```

This is visible in Vercel function logs for monitoring.

## Future: lenses

The pipeline is entity-type agnostic (`entity_type` = "camera" | "lens"). To add lenses later:
- Add a query parameter or second cron job for lenses
- The search query builder would use lens name instead of camera name
- Category ID would change from 625 (Film Cameras) to the appropriate lens category
- Everything else (classify, store, recompute) works unchanged
