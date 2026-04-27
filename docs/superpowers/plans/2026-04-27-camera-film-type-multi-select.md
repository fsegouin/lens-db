# Camera film-type multi-select filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Film type filter on `/cameras` into a multi-select pill row with OR semantics so cameras storing the compound `"120 roll film; 220 roll film"` are returned when a user selects `120 roll film` (currently 93 such cameras are missed).

**Architecture:** No schema change. Three-step rollout, each independently shippable: (1) server filter clause becomes a list-aware OR'd `ILIKE`, (2) the cached dropdown option list is split on `;` so atomic values appear as separate options, (3) the client `<select>` is replaced with a multi-select pill row whose URL serialization is comma-separated.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Drizzle ORM against Neon PostgreSQL. No frontend test framework — verification is via `psql` queries and manual browser checks.

**Spec:** `docs/superpowers/specs/2026-04-27-camera-film-type-multi-select-design.md`

---

## File map

- **Create:** none
- **Modify:**
  - `frontend/src/lib/api-utils.ts` — add `escapeLikeMetachars` helper (Task 1)
  - `frontend/src/app/cameras/page.tsx` — server filter clause + dropdown split (Tasks 1 and 2)
  - `frontend/src/app/api/cameras/route.ts` — server filter clause for paginated API (Task 1)
  - `frontend/src/components/CameraList.tsx` — multi-select pill UI + URL serialization (Task 3)

## Verification approach

There is no Jest/Vitest/Playwright in `frontend/`. Each task's verification step uses one of:
- **`psql`** against the Neon DB — for confirming row counts after server changes.
- **Dev server (`pnpm dev`)** — for browser-side checks.
- **`pnpm lint` and `pnpm build`** — final regression sweep before merging the branch.

The `DATABASE_URL` is in `frontend/.env.local`.

---

## Task 1: Server-side filter accepts a list of film types

**Goal:** Replace the exact-equality clause in both server entry points with an OR'd `ILIKE` over a parsed list. After this task, hitting `/cameras?filmType=120+roll+film` already returns 176 rows (83 atomic + 93 compound) — the bug is fixed even before the UI changes.

**Files:**
- Modify: `frontend/src/lib/api-utils.ts` (add helper)
- Modify: `frontend/src/app/cameras/page.tsx:146-150` (server filter clause)
- Modify: `frontend/src/app/api/cameras/route.ts:22, 72-74` (mirrored API filter clause)

---

- [ ] **Step 1: Add the `escapeLikeMetachars` helper to `api-utils.ts`**

Append this export to `frontend/src/lib/api-utils.ts`:

```ts
/**
 * Escape PostgreSQL LIKE/ILIKE metacharacters in a value so it can be
 * safely interpolated into a `%${value}%` substring pattern.
 * Drizzle's tagged template handles SQL injection — this guards
 * against pattern injection (e.g. a value containing `%` or `_`).
 */
export function escapeLikeMetachars(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
```

- [ ] **Step 2: Add a parser helper next to it for the comma-separated list shape**

Append to the same file. We add it here (rather than inlining it in two server files) because both `cameras/page.tsx` and `api/cameras/route.ts` need exactly the same parsing rules — dedupe, trim, drop empties, cap at 20:

```ts
/**
 * Parse a comma-separated multi-value query param.
 * Trims, drops empties, dedupes, and caps at 20 entries.
 */
export function parseMultiValueParam(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v && !seen.has(v)) seen.add(v);
    if (seen.size >= 20) break;
  }
  return Array.from(seen);
}
```

- [ ] **Step 3: Update `frontend/src/app/cameras/page.tsx` filter clause**

Replace the existing block at lines 146–150:

```ts
    if (params.filmType) {
      conditions.push(
        sql`${cameras.specs}->>'Film type' = ${params.filmType}`
      );
    }
```

with:

```ts
    const filmTypeList = parseMultiValueParam(params.filmType);
    if (filmTypeList.length > 0) {
      conditions.push(
        or(
          ...filmTypeList.map(
            (v) =>
              sql`${cameras.specs}->>'Film type' ILIKE ${"%" + escapeLikeMetachars(v) + "%"}`,
          ),
        ),
      );
    }
```

Then add the imports at the top of the file. The current import line is:

```ts
import { db } from "@/db";
```

After it (or grouped with the other `@/lib` imports if any are added later), add:

```ts
import { escapeLikeMetachars, parseMultiValueParam } from "@/lib/api-utils";
```

`or` is already imported on line 3 (`import { asc, desc, eq, and, or, sql } from "drizzle-orm";`) — no change needed there.

- [ ] **Step 4: Update `frontend/src/app/api/cameras/route.ts` filter clause**

The current line 22 reads:

```ts
  const filmType = searchParams.get("filmType") || undefined;
```

Replace with:

```ts
  const filmTypeList = parseMultiValueParam(searchParams.get("filmType"));
```

The current block at lines 72–74:

```ts
    if (filmType) {
      conditions.push(sql`${cameras.specs}->>'Film type' = ${filmType}`);
    }
```

Replace with:

```ts
    if (filmTypeList.length > 0) {
      conditions.push(
        or(
          ...filmTypeList.map(
            (v) =>
              sql`${cameras.specs}->>'Film type' ILIKE ${"%" + escapeLikeMetachars(v) + "%"}`,
          ),
        ),
      );
    }
```

Add to the existing `@/lib/api-utils` import on line 5:

```ts
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
```

becomes:

```ts
import {
  escapeLikeMetachars,
  getClientIP,
  parseMultiValueParam,
  rateLimitedResponse,
} from "@/lib/api-utils";
```

`or` is already imported on line 4 — no change.

- [ ] **Step 5: Run lint to catch any type/import errors**

Run from `frontend/`:

```bash
pnpm lint
```

Expected: passes with no new errors.

- [ ] **Step 6: Verify the bug fix at the database layer**

Start the dev server in another terminal: `cd frontend && pnpm dev`.

Then run these `curl` checks (the page is server-rendered, so the URL response includes the rendered HTML containing the count):

```bash
# Pre-existing single-match URL: should now return 176 (previously 83)
curl -s "http://localhost:3000/cameras?filmType=120%20roll%20film" \
  | grep -oE '<span class="text-foreground">[0-9,]+</span> bodies' | head -1

# Two-value URL: should also return 176
curl -s "http://localhost:3000/cameras?filmType=120%20roll%20film,220%20roll%20film" \
  | grep -oE '<span class="text-foreground">[0-9,]+</span> bodies' | head -1

# Polaroid film: should return 2
curl -s "http://localhost:3000/cameras?filmType=Polaroid%20film" \
  | grep -oE '<span class="text-foreground">[0-9,]+</span> bodies' | head -1
```

Expected:
- First and second commands output `<span class="text-foreground">176</span> bodies`
- Third outputs `<span class="text-foreground">2</span> bodies`

Optionally cross-check against the DB directly (uses `frontend/.env.local`):

```bash
cd frontend && set -a && source .env.local && set +a
psql "$DATABASE_URL" -c "SELECT count(*) FROM cameras WHERE specs->>'Film type' ILIKE '%120 roll film%';"
```

Expected: `176`.

- [ ] **Step 7: Verify pagination of the API endpoint matches**

```bash
curl -s "http://localhost:3000/api/cameras?filmType=120%20roll%20film&cursor=0" | python3 -c 'import sys,json; print(json.load(sys.stdin)["total"])'
```

Expected: `176`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api-utils.ts \
        frontend/src/app/cameras/page.tsx \
        frontend/src/app/api/cameras/route.ts
git commit -m "Make camera film-type filter accept a list and use ILIKE

The exact-equality clause missed cameras whose 'Film type' spec is the
compound '120 roll film; 220 roll film' (93 cameras). Parse a
comma-separated list and OR matches with ILIKE so a single 120 selection
already catches the compound rows. The pill UI lands in a follow-up
commit; this change alone fixes the bug for direct URL hits."
```

---

## Task 2: Split compound film-type options in the cached dropdown list

**Goal:** Make the option list returned by `getCachedDropdownData` split compound `;`-separated values, so the dropdown produces six atomic options (`120 roll film`, `220 roll film`, `127 roll film`, `135 cartridge-loaded film`, `Non-standard film`, `Polaroid film`) instead of four atomic + one compound.

**Files:**
- Modify: `frontend/src/app/cameras/page.tsx:39` (inside `getCachedDropdownData`)

---

- [ ] **Step 1: Update the dropdown-collection loop**

The current line 39 reads:

```ts
      if (s["Film type"]) filmTypeSet.add(s["Film type"]);
```

Replace with:

```ts
      if (s["Film type"]) {
        for (const part of s["Film type"].split(";")) {
          const v = part.trim();
          if (v) filmTypeSet.add(v);
        }
      }
```

- [ ] **Step 2: Bust the dropdown cache for local verification**

`unstable_cache` keeps a 24h TTL. Since the cache key is unchanged, a freshly built dev server doesn't automatically pick up the new shape until expiry. For local verification, restart the dev server with cache cleared:

```bash
cd frontend
rm -rf .next
pnpm dev
```

Production rollout is fine without a forced bust — see the spec's "Cache key" note (the new filter clause's `ILIKE` is forward-compatible with the old compound option).

- [ ] **Step 3: Verify the option list contains six atomic values**

With the dev server running, fetch the page HTML and grep the `<option>` tags inside the Film type select (currently still a `<select>` — Task 3 swaps it for pills, but for now this is the easiest place to check):

```bash
curl -s "http://localhost:3000/cameras" \
  | sed -n '/All film types/,/<\/select>/p' \
  | grep -oE '<option [^>]*>[^<]+</option>'
```

Expected output (order-independent — sort alphabetically to compare):

```
<option value="">All film types</option>
<option value="120 roll film">120 roll film</option>
<option value="127 roll film">127 roll film</option>
<option value="135 cartridge-loaded film">135 cartridge-loaded film</option>
<option value="220 roll film">220 roll film</option>
<option value="Non-standard film">Non-standard film</option>
<option value="Polaroid film">Polaroid film</option>
```

There must **not** be an option whose value contains `;` (`"120 roll film; 220 roll film"`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/cameras/page.tsx
git commit -m "Split compound film-type values when building dropdown options

The 'Film type' spec stores '120 roll film; 220 roll film' as a single
string for 93 cameras, so the dropdown previously offered that compound
as its own option. Split on ';' so users see atomic options and a single
selection covers cameras supporting that format in any combination."
```

---

## Task 3: Replace the Film type `<select>` with a multi-select pill row

**Goal:** Swap the dropdown for a row of toggleable pills matching the existing Type (shutter) filter visual on the same page. URL param becomes a comma-separated list. A camera matches if it supports any selected format (OR semantics — already implemented server-side in Task 1).

**Files:**
- Modify: `frontend/src/components/CameraList.tsx`

---

- [ ] **Step 1: Parse the URL param into a list**

Around line 112, the current line reads:

```ts
  const filmType = searchParams.get("filmType") || "";
```

Add a parsed list variable directly after it:

```ts
  const filmType = searchParams.get("filmType") || "";
  const filmTypeList = filmType ? filmType.split(",").filter(Boolean) : [];
```

(The raw `filmType` string stays in scope because `applyFilters` and `buildApiUrl` still pass it through as the URL param.)

- [ ] **Step 2: Replace the Film type FilterGroup**

The current block at lines 350–369:

```tsx
        {filmTypes.length > 0 && (
          <FilterGroup
            label="Film type"
            clearable={!!filmType}
            onClear={() => applyFilters({ filmType: "" })}
          >
            <select
              value={filmType}
              onChange={(e) => applyFilters({ filmType: e.target.value })}
              className={filterSelectClass(!!filmType)}
            >
              <option value="">All film types</option>
              {filmTypes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </FilterGroup>
        )}
```

Replace with:

```tsx
        {filmTypes.length > 0 && (
          <FilterGroup
            label="Film type"
            clearable={filmTypeList.length > 0}
            onClear={() => applyFilters({ filmType: "" })}
          >
            <div className="flex flex-wrap gap-1.5">
              {filmTypes.map((f) => {
                const active = filmTypeList.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() => {
                      const next = active
                        ? filmTypeList.filter((v) => v !== f)
                        : [...filmTypeList, f];
                      const value = next.join(",");
                      trackEvent("camera_filter_apply", {
                        filter: "filmType",
                        value,
                      });
                      applyFilters({ filmType: value });
                    }}
                    className={`mono rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </FilterGroup>
        )}
```

The pill class string is copied verbatim from the existing Type (shutter) filter at lines 315–319 to ensure visual parity.

- [ ] **Step 3: Verify lint and types pass**

```bash
cd frontend
pnpm lint
```

Expected: passes with no new errors. (`trackEvent` is already imported on line 9; no new imports needed.)

- [ ] **Step 4: Manual UI verification (dev server)**

With `pnpm dev` running, open `http://localhost:3000/cameras` in a browser and confirm:

1. **Visual.** The Film type group shows pills (not a dropdown) styled identically to the Type (shutter) pills above it.
2. **Multi-toggle.** Click `120 roll film` — pill goes filled, URL becomes `?filmType=120+roll+film` (URL-encoded form), the body count drops to 176. Click `220 roll film` — second pill goes filled, URL becomes `?filmType=120+roll+film%2C220+roll+film` (or similar — note the `%2C` for the comma), count stays 176 (any-of).
3. **Deselect.** Click an active pill again — it goes outlined, the value is removed from the URL.
4. **Per-group clear.** With one or more pills active, the group's "clear" link appears. Click it — all film-type pills go outlined, `filmType` disappears from the URL, page-wide bodies count returns to its base.
5. **Page-level clear.** Activate at least one Film type pill plus one other filter (e.g. a Mount system). Click the bottom "Clear all filters" button — all filters reset, URL goes to `/cameras`.
6. **Back/forward.** Activate two pills, navigate elsewhere via a system-name click, hit back — the two pills come back active.
7. **Wrap.** Resize the window narrow (or open dev-tools mobile preview); pills wrap onto multiple lines without overflow.
8. **Infinite scroll.** With one or more pills active, scroll past the first 50 results — the next page loads and matches the same filter set.
9. **Empty state.** Combine `filmType=Polaroid film` with a `Crop factor` value that excludes them; page shows the existing "No cameras match those filters." text.

- [ ] **Step 5: Run a final lint + production build to catch regressions**

```bash
cd frontend
pnpm lint
pnpm build
```

Expected: both succeed. Any TypeScript error here indicates a missed prop/type update.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CameraList.tsx
git commit -m "Replace Film type dropdown with multi-select pill row

Selecting multiple film types now ORs them, so a user can pick
'120 roll film' alone or alongside '220 roll film' and see every
camera that supports any of them. UI matches the existing Type
(shutter) pill row on the same page; URL serializes selections as a
comma-separated 'filmType' value."
```

---

## Affected files (summary)

| File | Tasks | Purpose |
| --- | --- | --- |
| `frontend/src/lib/api-utils.ts` | 1 | New `escapeLikeMetachars` and `parseMultiValueParam` helpers |
| `frontend/src/app/cameras/page.tsx` | 1, 2 | Multi-value filter clause + dropdown split |
| `frontend/src/app/api/cameras/route.ts` | 1 | Multi-value filter clause for paginated API |
| `frontend/src/components/CameraList.tsx` | 3 | Pill UI + comma-separated URL serialization |

## Out of scope (deferred)

- **Schema migration** of `Film type` from a free-text `;`-separated string to a real array column. The current ILIKE-based clause is fast enough for the 2k-row table and avoids a migration. Worth revisiting if the cameras table grows or if more multi-value spec fields appear.
- **Interchangeable backs / accessory-based format compatibility** (e.g. a Hasselblad gaining Polaroid via a back). Originally raised in brainstorming; out of scope here, deferred to a future spec.
- **Multi-select for other camera filters** (system, sensor size, type, etc.). None have multi-value data today; not adding a UI affordance that has no user-facing benefit.
