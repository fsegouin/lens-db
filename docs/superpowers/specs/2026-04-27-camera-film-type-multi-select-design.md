# Camera film-type filter — multi-select

## Problem

The Film type filter on `/cameras` is a single-value `<select>` whose server clause is `specs->>'Film type' = $value`. The `Film type` JSON spec on `cameras` is a free-text string and 93 cameras store the compound value `"120 roll film; 220 roll film"`. Selecting `"120 roll film"` therefore misses every camera that supports both 120 and 220 roll film. Users hitting the 120 filter expect to see those bodies and currently do not.

Distinct values in the field today (count):

- `135 cartridge-loaded film` — 1234
- `120 roll film; 220 roll film` — 93
- `120 roll film` — 83
- `127 roll film` — 5
- `Non-standard film` — 3
- `Polaroid film` — 2

After splitting the compound entry on `;`, the field reduces to six clean atomic values: `120 roll film`, `220 roll film`, `127 roll film`, `135 cartridge-loaded film`, `Non-standard film`, `Polaroid film`.

## Goals

- A user filtering by `120 roll film` sees both `120 roll film` cameras and `120 roll film; 220 roll film` cameras (176 rows total instead of 83).
- The Film type filter accepts multiple values; a camera matches if it supports **any** of them (OR semantics).
- The change ships with no schema migration, no API contract break, and no new UI primitive — it reuses the existing pill pattern already used by the Type (shutter) filter on the same page.

## Non-goals

- No data-model change for film formats. Storage stays as the existing `specs->>'Film type'` free-text string.
- No first-class support for interchangeable backs / accessory-based format compatibility (e.g. a Hasselblad gaining Polaroid via a back). That's a separate, larger spec deferred for now.
- No multi-select treatment for any other camera filter. Only Film type has the multi-value data quirk today.
- No changes to `/lenses` filters.

## Architecture overview

Three files carry the change:

1. **`frontend/src/app/cameras/page.tsx`** — split each camera's `specs->>'Film type'` on `;` when building the cached dropdown option list, so the compound `"120 roll film; 220 roll film"` contributes both `120 roll film` and `220 roll film` rather than appearing as a single compound option. Rewrite the server-side filter clause to accept a list of values and OR them with `ILIKE` against the underlying string.
2. **`frontend/src/app/api/cameras/route.ts`** — mirror the same parse + OR'd `ILIKE` clause so infinite-scroll pagination produces the same result set as the initial server-rendered page.
3. **`frontend/src/components/CameraList.tsx`** — replace the `<select>` in the Film type `FilterGroup` with a row of toggleable multi-select pills, styled identically to the existing Type (shutter) pills further up the sidebar. URL param becomes a comma-separated list.

No DB migration, no new dependency, no new shared component. Single `filmType` query key remains the contract.

## UI / component

In `CameraList.tsx`, the Film type `FilterGroup` swaps its `<select>` for the same pill pattern already used by the Type (shutter) group on the same page, but with multi-select semantics:

- Each distinct value renders as a toggleable pill. Clicking toggles that value in the active set.
- Active pills use the filled style (`border-foreground bg-foreground text-background`); inactive pills use the outline style. Identical to existing Type pills — no new visual primitive.
- `filmTypes` prop becomes the split + deduped list of six values, alphabetically ordered to match the convention of the other camera filters.
- The group's per-filter "clear" link clears all selected pills at once (sets the list to empty).
- Page-level "Clear all filters" continues to work; the `anyFilterActive` check uses `filmTypeList.length > 0` instead of a truthy string.
- The existing `camera_filter_apply` analytics event fires per toggle with the **resulting** comma-joined value, preserving event shape.
- Mobile: pills already wrap (`flex-wrap gap-1.5`); no extra layout work needed.

## Data flow (URL ↔ server ↔ query)

**URL param.** Single key, comma-separated:

```
?filmType=120+roll+film,220+roll+film
```

Single key matches the rest of the filter params, so one `searchParams.get()` call suffices. Values are URI-encoded by `URLSearchParams`. No current Film type value contains a comma; empty segments after split are dropped.

**Server-side parse.** Both `cameras/page.tsx` and `api/cameras/route.ts` parse with the same trivial inline helper:

```ts
const filmTypes = (searchParams.get("filmType") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
```

Empty list → no clause added.

**SQL clause.** Replace the current `${cameras.specs}->>'Film type' = ${filmType}` with an OR across `ILIKE` matches:

```ts
or(
  ...filmTypes.map((v) =>
    sql`${cameras.specs}->>'Film type' ILIKE ${'%' + escapeLikeMetachars(v) + '%'}`
  )
)
```

`escapeLikeMetachars` is a one-line helper that backslash-escapes `%`, `_`, and `\`. Drizzle's tagged template handles SQL injection; this guards against pattern injection.

**Dropdown building.** `getCachedDropdownData` in `cameras/page.tsx` currently does `filmTypeSet.add(s["Film type"])`. Change to:

```ts
for (const part of s["Film type"].split(";")) {
  const v = part.trim();
  if (v) filmTypeSet.add(v);
}
```

Result: six clean atomic options instead of four atomic options plus one compound.

**Cache key.** `unstable_cache` key `"cameras-dropdown-data"` is unchanged. The shape of the returned `filmTypes` array is unchanged (still `string[]`), only the contents change. The 24h TTL ages out naturally; no forced bust required.

**Pagination.** `buildApiUrl` in `CameraList.tsx` forwards `filmType` as-is — already a string, still a string. Cursor logic untouched.

## Edge cases & error handling

- **Empty list / unknown values.** `filmType=""` or all-empty after split → no clause added (matches today's empty-string behaviour). Unknown value (hand-typed junk URL) → `ILIKE` matches zero rows; the existing "No cameras match those filters." empty state renders.
- **Compound value in URL.** A stale URL containing `"120 roll film; 220 roll film"` as a single value → `ILIKE %120 roll film; 220 roll film%` matches the still-stored compound rows (since the underlying spec wasn't migrated). The page degrades gracefully rather than 404'ing.
- **Duplicate values in URL.** Dedupe the split list before building OR clauses to avoid quadratic OR chains on malformed shared links.
- **`LIKE` metacharacter escape.** `%`, `_`, `\` in selected values get backslash-escaped before being wrapped in `%…%`. None appear in current values, but the URL is user-controllable, so this is mandatory.
- **Length cap.** Cap the split list at 20 entries to bound query size. Anything beyond is dropped silently. Matches the existing 10-word cap on `q`.
- **Analytics.** When deselection empties the list, still fire `camera_filter_apply` with empty value so deselections show up in the funnel — matches how the dropdown's "All" option behaved before.

No new error states surface to the user; all failure modes collapse into the existing empty-result UI.

## Testing

There is no test framework configured in `frontend/` (no Jest/Vitest/Playwright). Verification is manual.

**Database-level (psql one-liners):**

- Pre-change confirmation: `SELECT count(*) FROM cameras WHERE specs->>'Film type' = '120 roll film'` returns 83.
- Post-change, hitting `/cameras?filmType=120+roll+film`: result count is **176** (83 atomic + 93 compound). This is the bug-fix verification.
- `/cameras?filmType=120+roll+film,220+roll+film`: also 176 (any-of semantics; no rows store 220-only).
- `/cameras?filmType=Polaroid+film`: returns 2.

**UI verification (dev server, `/cameras`):**

- Pills render in the Film type group with the same visual style as Type/shutter pills above them.
- Clicking a pill toggles active state; multiple pills can be active simultaneously.
- URL updates to comma-separated `filmType=…` on every toggle; back/forward restore selection state.
- Per-group "clear" link wipes all selected pills.
- Page-level "Clear all filters" wipes them too.
- Empty state still appears when a filter combination yields zero results.
- On a narrow viewport, pills wrap cleanly with no overflow.
- Infinite scroll continues to work past page 1 with multiple film types selected.

**Regression spots:**

- Other camera filters (system, sensor size, type, model, sensor type, crop factor) still single-select and unaffected.
- `/lenses` filters untouched.
- The `unstable_cache` dropdown returns six values, not four atomic plus two compounds. Verifiable by inspecting the page source / Network tab on `/cameras`.

## Affected files

- `frontend/src/app/cameras/page.tsx` — dropdown split + multi-value filter clause
- `frontend/src/app/api/cameras/route.ts` — multi-value filter clause (mirrors page)
- `frontend/src/components/CameraList.tsx` — pill UI, prop shape, URL serialisation
