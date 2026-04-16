# Lens Pricing Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display lens pricing data (median price, price estimates, price history, eBay live listings) on lens list and detail pages, mirroring the existing camera pricing UI.

**Architecture:** Modify 4 existing files to add priceEstimates joins and pricing UI. No new files — reuses existing PriceCard, PriceChart, EbayListings components which are already entity-agnostic.

**Tech Stack:** Next.js, Drizzle ORM, React, existing PriceCard/EbayListings components

---

### File Structure

All modifications, no new files:

| File | Change |
|------|--------|
| `frontend/src/app/api/lenses/route.ts` | Add priceEstimates LEFT JOIN, price filtering, price sorting |
| `frontend/src/app/lenses/page.tsx` | Add priceEstimates LEFT JOIN, price filtering, pass avgPrice to LensList |
| `frontend/src/components/LensList.tsx` | Add avgPrice to types, price column in table, price filter inputs |
| `frontend/src/app/lenses/[slug]/page.tsx` | Fetch priceEstimate + priceHistory, render PriceCard + EbayListings |

---

### Task 1: API Route — Add Pricing to `/api/lenses`

**Files:**
- Modify: `frontend/src/app/api/lenses/route.ts`

- [ ] **Step 1: Add priceEstimates import**

At line 3, add `priceEstimates` to the schema import:

```typescript
import { lenses, systems, lensSeries, lensSeriesMemberships, priceEstimates } from "@/db/schema";
```

- [ ] **Step 2: Add avgPrice reference and priceMin/priceMax params**

After line 31 (`const series = ...`), add:

```typescript
const priceMin = searchParams.get("priceMin") || undefined;
const priceMax = searchParams.get("priceMax") || undefined;
```

After line 35 (inside the `try` block, before `const conditions = []`), add:

```typescript
const avgPrice = priceEstimates.medianPrice;
```

- [ ] **Step 3: Add price filter conditions**

After the `productionStatus` condition block (after current line 103) and before the `series` condition block, add:

```typescript
if (priceMin) {
  const val = parseInt(priceMin);
  if (Number.isFinite(val))
    conditions.push(sql`${avgPrice} >= ${val}`);
}
if (priceMax) {
  const val = parseInt(priceMax);
  if (Number.isFinite(val))
    conditions.push(sql`${avgPrice} <= ${val}`);
}
```

- [ ] **Step 4: Add price to sortColumns**

In the `sortColumns` object, add `price: avgPrice` after the `rating` entry:

```typescript
const sortColumns: Record<string, any> = {
  name: lenses.name,
  brand: lenses.brand,
  system: systems.name,
  focalLength: lenses.focalLengthMin,
  aperture: lenses.apertureMin,
  year: lenses.yearIntroduced,
  weight: lenses.weightG,
  rating: lenses.averageRating,
  price: avgPrice,
};
```

- [ ] **Step 5: Update sort to push null prices to end**

Replace the current sort logic:

```typescript
const sortCol = sortColumns[sort || ""] || lenses.name;
const orderFn = order === "desc" ? desc : asc;
const sortByName = sortCol === lenses.name;
const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
const orderClauses = sortByName
  ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
  : [orderFn(sortCol)];
```

With:

```typescript
const sortKey = sort || "";
const sortCol = sortColumns[sortKey] || lenses.name;
const orderFn = order === "desc" ? desc : asc;
const sortByName = sortCol === lenses.name;
const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
const orderClauses = sortByName
  ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
  : sortKey === "price"
    ? [sql`${avgPrice} IS NULL`, orderFn(sortCol)]
    : [orderFn(sortCol)];
```

- [ ] **Step 6: Add priceEstimates LEFT JOIN to all queries**

The count query currently has a conditional system join. Both branches need the priceEstimates join added. Replace the count query block:

```typescript
const needsSystemJoin = !!system;

const [countResult] = needsSystemJoin
  ? await db
      .select({ count: sql<number>`count(*)` })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "lens"),
        eq(priceEstimates.entityId, lenses.id),
      ))
      .where(where)
  : await db
      .select({ count: sql<number>`count(*)` })
      .from(lenses)
      .leftJoin(priceEstimates, and(
        eq(priceEstimates.entityType, "lens"),
        eq(priceEstimates.entityId, lenses.id),
      ))
      .where(where);
const total = Number(countResult.count);
```

Update the items query to include avgPrice and priceEstimates join:

```typescript
const items = await db
  .select({ lens: lenses, system: systems, avgPrice: avgPrice })
  .from(lenses)
  .leftJoin(systems, eq(lenses.systemId, systems.id))
  .leftJoin(priceEstimates, and(
    eq(priceEstimates.entityType, "lens"),
    eq(priceEstimates.entityId, lenses.id),
  ))
  .where(where)
  .orderBy(...orderClauses)
  .limit(PAGE_SIZE)
  .offset(cursor);
```

- [ ] **Step 7: Update the response to include avgPrice in series mapping**

Update the `itemsWithSeries` mapping to preserve `avgPrice`:

```typescript
const itemsWithSeries = items.map((r) => ({
  ...r,
  series: seriesMap[r.lens.id] || [],
}));
```

This already spreads `r` which now includes `avgPrice`, so no change needed here. Just verify the existing code works.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/api/lenses/route.ts
git commit -m "Add pricing support to lenses API route"
```

---

### Task 2: Server Page — Add Pricing to `/lenses/page.tsx`

**Files:**
- Modify: `frontend/src/app/lenses/page.tsx`

- [ ] **Step 1: Add priceEstimates import**

Update the schema import at line 2:

```typescript
import { lenses, systems, lensSeries, lensSeriesMemberships, priceEstimates } from "@/db/schema";
```

Add `and` to drizzle-orm imports if not already present (it is already at line 3).

- [ ] **Step 2: Update the initialItems type to include avgPrice**

Update the type at lines 70-74:

```typescript
let initialItems: {
  lens: typeof lenses.$inferSelect;
  system: typeof systems.$inferSelect | null;
  series: { name: string; slug: string }[];
  avgPrice: number | null;
}[] = [];
```

- [ ] **Step 3: Add priceMin/priceMax to SearchParams**

Add to the SearchParams type:

```typescript
type SearchParams = Promise<{
  system?: string;
  type?: string;
  brand?: string;
  q?: string;
  minFocal?: string;
  maxFocal?: string;
  minAperture?: string;
  maxAperture?: string;
  year?: string;
  lensType?: string;
  era?: string;
  productionStatus?: string;
  series?: string;
  priceMin?: string;
  priceMax?: string;
  sort?: string;
  order?: string;
}>;
```

- [ ] **Step 4: Add avgPrice reference and price filtering**

After the conditions array is created and before the first condition, add:

```typescript
const avgPrice = priceEstimates.medianPrice;
```

After the `productionStatus` condition block (after the `series` condition block), add price filtering:

```typescript
if (params.priceMin) {
  const val = parseInt(params.priceMin);
  if (Number.isFinite(val))
    conditions.push(sql`${avgPrice} >= ${val}`);
}
if (params.priceMax) {
  const val = parseInt(params.priceMax);
  if (Number.isFinite(val))
    conditions.push(sql`${avgPrice} <= ${val}`);
}
```

- [ ] **Step 5: Add price to sortColumns and update sort logic**

Add `price: avgPrice` to sortColumns:

```typescript
const sortColumns: Record<string, any> = {
  name: lenses.name,
  brand: lenses.brand,
  system: systems.name,
  focalLength: lenses.focalLengthMin,
  aperture: lenses.apertureMin,
  year: lenses.yearIntroduced,
  weight: lenses.weightG,
  rating: lenses.averageRating,
  price: avgPrice,
};
```

Update the sort logic to handle price null-last:

```typescript
const sortKey = params.sort || "";
const sortCol = sortColumns[sortKey] || lenses.name;
const orderFn = params.order === "desc" ? desc : asc;
const sortByName = sortCol === lenses.name;
const namePrefix = sql`regexp_replace(${lenses.name}, '\\d+(\\.\\d+)?mm.*$', '')`;
const orderClauses = sortByName
  ? [orderFn(namePrefix), asc(lenses.focalLengthMin), asc(lenses.apertureMin)]
  : sortKey === "price"
    ? [sql`${avgPrice} IS NULL`, orderFn(sortCol)]
    : [orderFn(sortCol)];
```

- [ ] **Step 6: Add priceEstimates LEFT JOIN to count and items queries**

Update count query (both branches need priceEstimates join, same pattern as Task 1 Step 6).

Update items query:

```typescript
const rawItems = await db
  .select({ lens: lenses, system: systems, avgPrice: avgPrice })
  .from(lenses)
  .leftJoin(systems, eq(lenses.systemId, systems.id))
  .leftJoin(priceEstimates, and(
    eq(priceEstimates.entityType, "lens"),
    eq(priceEstimates.entityId, lenses.id),
  ))
  .where(where)
  .orderBy(...orderClauses)
  .limit(PAGE_SIZE)
  .offset(0);
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/lenses/page.tsx
git commit -m "Add pricing support to lenses server page"
```

---

### Task 3: Client Component — Add Pricing to `LensList.tsx`

**Files:**
- Modify: `frontend/src/components/LensList.tsx`

- [ ] **Step 1: Add avgPrice to LensRow type**

```typescript
type LensRow = {
  lens: typeof lenses.$inferSelect;
  system: typeof systems.$inferSelect | null;
  series: SeriesInfo[];
  avgPrice: number | null;
};
```

- [ ] **Step 2: Add priceMin/priceMax to URL state**

Add to the searchParams parsing (after `order`):

```typescript
const priceMin = searchParams.get("priceMin") || "";
const priceMax = searchParams.get("priceMax") || "";
```

Add form state:

```typescript
const [formPriceMin, setFormPriceMin] = useState(priceMin);
const [formPriceMax, setFormPriceMax] = useState(priceMax);
```

Add to the useEffect sync block:

```typescript
setFormPriceMin(priceMin);
setFormPriceMax(priceMax);
```

- [ ] **Step 3: Add priceMin/priceMax to buildApiUrl**

In the `buildApiUrl` callback, add:

```typescript
if (priceMin) params.set("priceMin", priceMin);
if (priceMax) params.set("priceMax", priceMax);
```

Add `priceMin, priceMax` to the dependency array.

- [ ] **Step 4: Add priceMin/priceMax to applyFilters**

Update the `applyFilters` function signature to include `priceMin?: string; priceMax?: string`.

Inside the function, add:

```typescript
const priceMinVal = overrides?.priceMin ?? formPriceMin;
const priceMaxVal = overrides?.priceMax ?? formPriceMax;
```

And add to the params building:

```typescript
if (priceMinVal) params.set("priceMin", priceMinVal);
if (priceMaxVal) params.set("priceMax", priceMaxVal);
```

- [ ] **Step 5: Add price filter inputs to the filter bar**

After the year input (after the `</div>` closing the year input wrapper), add:

```html
<div>
  <label className="sr-only" htmlFor="lens-price-min">Min price</label>
  <Input
    id="lens-price-min"
    type="number"
    placeholder="Min $"
    value={formPriceMin}
    onChange={(e) => { setFormPriceMin(e.target.value); debouncedApply({ priceMin: e.target.value }); }}
    className="h-10 w-24"
  />
</div>
<div>
  <label className="sr-only" htmlFor="lens-price-max">Max price</label>
  <Input
    id="lens-price-max"
    type="number"
    placeholder="Max $"
    value={formPriceMax}
    onChange={(e) => { setFormPriceMax(e.target.value); debouncedApply({ priceMax: e.target.value }); }}
    className="h-10 w-24"
  />
</div>
```

- [ ] **Step 6: Add price column to table**

In the column definitions array, add after `year` and before `weight`:

```typescript
{ key: "price", label: "Avg Price" },
```

In the table body row rendering, add after the year `<TableCell>` and before the weight `<TableCell>`:

```html
<TableCell className="text-zinc-600 dark:text-zinc-400">
  {avgPrice != null
    ? `$${avgPrice.toLocaleString()}`
    : "\u2014"}
</TableCell>
```

Update the destructuring in the `items.map` to include `avgPrice`:

```typescript
{items.map(({ lens, system, series: lensSeries, avgPrice }) => (
```

Update `colSpan` on the sentinel row from `10` to `11` (and the `TableSkeleton` `columns` from `10` to `11`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/LensList.tsx
git commit -m "Add price column and filters to lens list"
```

---

### Task 4: Detail Page — Add Pricing to Lens Detail

**Files:**
- Modify: `frontend/src/app/lenses/[slug]/page.tsx`

- [ ] **Step 1: Add imports**

Add to imports:

```typescript
import { Suspense } from "react";
import { and, desc } from "drizzle-orm";
import { priceEstimates, priceHistory } from "@/db/schema";
import PriceCard from "@/components/PriceCard";
import EbayListings from "@/components/EbayListings";
import EbayListingsSkeleton from "@/components/EbayListingsSkeleton";
```

Note: `eq` is already imported. `and` and `desc` may need to be added to the existing drizzle-orm import. `Suspense` is not currently imported.

- [ ] **Step 2: Add price data queries**

After the `currentUser` line (line 72) and before the `allSystems` line, add:

```typescript
// Fetch price data
const [priceEstimate] = await db
  .select()
  .from(priceEstimates)
  .where(and(
    eq(priceEstimates.entityType, "lens"),
    eq(priceEstimates.entityId, lens.id),
  ))
  .limit(1);

const priceHistoryRows = await db
  .select({
    saleDate: priceHistory.saleDate,
    condition: priceHistory.condition,
    priceUsd: priceHistory.priceUsd,
    source: priceHistory.source,
    sourceUrl: priceHistory.sourceUrl,
  })
  .from(priceHistory)
  .where(and(
    eq(priceHistory.entityType, "lens"),
    eq(priceHistory.entityId, lens.id),
  ))
  .orderBy(desc(priceHistory.saleDate));
```

- [ ] **Step 3: Render PriceCard and EbayListings**

In the JSX, after the `<RatingWidget>` component, add:

```html
<PriceCard
  estimate={priceEstimate ?? null}
  history={priceHistoryRows}
/>

<Suspense fallback={<EbayListingsSkeleton />}>
  <EbayListings query={lens.name} />
</Suspense>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/lenses/[slug]/page.tsx
git commit -m "Add pricing and eBay listings to lens detail page"
```

---

### Task 5: Build Verification

- [ ] **Step 1: Run the full build**

Run: `cd frontend && pnpm build`

Expected: build succeeds

- [ ] **Step 2: Manual verification**

Start dev server, navigate to `/lenses` — verify Avg Price column appears with price data for lenses that have been scraped. Navigate to a lens detail page that has price data — verify PriceCard and EbayListings render.
