# Camera film-type multi-select — Follow-ups

> Companion to:
> - Spec: `docs/superpowers/specs/2026-04-27-camera-film-type-multi-select-design.md`
> - Plan: `docs/superpowers/plans/2026-04-27-camera-film-type-multi-select.md`
>
> Shipped on `main` as merge commit `d5f8262d` ("Merge branch 'film-type-multi-select'") containing:
> - `08a5ef5b` Make camera film-type filter accept a list and use ILIKE
> - `a9d9b460` Split compound film-type values when building dropdown options
> - `e1e37065` Replace Film type dropdown with multi-select pill row

The feature is fully working and was verified end-to-end (`?filmType=120 roll film` → 176 cameras, `?filmType=120 roll film,220 roll film` → 176, `?filmType=Polaroid film,120 roll film` → 178). The items below are deferred from the original spec/reviews. None block anything; pick them up when convenient.

---

## 1. Adopt `escapeLikeMetachars` at the other LIKE call sites

**What.** Three other places in the repo interpolate user-controlled strings into `LIKE`/`ILIKE` patterns without escaping `%`/`_`/`\`. Now that the helper exists in `frontend/src/lib/api-utils.ts`, adopting it is consistent and cheap.

**Sites** (line numbers as of merge commit `d5f8262d`):

- `frontend/src/app/api/cameras/route.ts` — the `model` filter clause: `sql\`${cameras.specs}->>'Model' LIKE ${model + "%"}\``.
- `frontend/src/app/cameras/page.tsx` — the same `model` filter clause, mirrored in the page server.
- `frontend/src/app/api/admin/users/route.ts` — `ilike(users.displayName, \`%${search}%\`)` (or similar; verify at touch time since admin code has been changing).

**Why it matters.** Not currently exploitable as a security issue — Drizzle's tagged template prevents SQL injection, and there's no auth/authorization bypass. Worst case is "filter matches more than the user typed" (e.g. typing `_` matches any character). But:

- It's the same defense the `Film type` filter now applies; consistency makes the intent obvious to future readers.
- It removes a class of "weird filter result" reports we'd never want to debug.

**Effort.** Tiny — wrap each substring in `escapeLikeMetachars(v)` before concatenating with `%`. One line per site, one shared import at the top of each file.

**Suggested approach.** Single PR titled "Apply LIKE-pattern escape to remaining filter clauses." No spec or plan needed; the helper already exists with JSDoc explaining the distinction from SQL injection.

---

## 2. Re-theme the Film type pills when the app-shell refactor lands

**What.** The Film type pill row currently lives inside the existing horizontal filter bar in `CameraList.tsx` (the bar that uses `<select>` for every other filter). The app-shell refactor in flight introduces a sidebar layout with a `FilterGroup` primitive, `mono` typography, and a Type-shutter filter that's also rendered as pills with `--fg-mid` / `--line-strong` design tokens. When that refactor lands, the Film type pills will look out of place stylistically.

**Action.** Re-theme the inactive pill class to match the Type-shutter pill visual and wrap the group in `FilterGroup` (so it picks up per-group "clear" affordance and the `mono` label styling).

- **Active class** (already correct, no change): `border-foreground bg-foreground text-background`.
- **Inactive class** (needs swap): currently `border-border bg-background text-zinc-600 hover:border-zinc-500 hover:text-foreground dark:text-zinc-400 dark:hover:border-zinc-400`; the new value is whatever the Type-shutter filter uses in the merged refactor (likely `border-border bg-background text-[var(--fg-mid)] hover:border-[var(--line-strong)] hover:text-foreground` plus the `mono` utility on the button).
- **Wrapper**: replace `<div role="group" aria-label="Film type"><div className="flex flex-wrap gap-1.5">…</div></div>` with `<FilterGroup label="Film type" clearable={filmTypeList.length > 0} onClear={() => applyFilters({ filmType: "" })}><div className="flex flex-wrap gap-1.5">…</div></FilterGroup>`.

**Code location.** `frontend/src/components/CameraList.tsx`. Search for `<div role="group" aria-label="Film type">`.

**Load-bearing logic to preserve through the merge.** Don't lose:
- `const filmTypeList = filmType ? filmType.split(",").filter(Boolean) : [];` (the parsed-list derivation).
- The pill click handler that toggles, comma-joins, fires analytics, calls `applyFilters({ filmType: value })`, and updates `formFilmType`.
- `aria-pressed={active}` on each button.

**Effort.** Tiny — class string swap and a single wrapper change. Mostly a stylistic merge; no behavior changes.

---

## 3. Row-cell click on compound Film type values

**What.** The cameras list lets users click a cell value to apply it as a filter. When a row's `Film type` is the compound string `"120 roll film; 220 roll film"`, clicking that cell sets `?filmType=120 roll film; 220 roll film` (the whole compound string as one value).

**Current behavior** (functional but slightly off):
- `parseMultiValueParam` splits on `,` not `;`, so the compound string round-trips as one 30-char token.
- The SQL clause becomes `ILIKE %120 roll film; 220 roll film%` and matches the 93 compound rows correctly.
- BUT: the pill UI shows zero active pills (no atomic option equals the compound string), so the user can't tell which formats are "live."
- LATENT: if the data ever stored components in reverse order (`"220 roll film; 120 roll film"`), the substring match would miss them. None today.

**Suggested fix.** In the row-cell click handler for the `Film type` column, split the cell value on `;`, trim each part, drop empties, comma-join, and pass that to `applyFilters({ filmType: parts.join(",") })`. The result: clicking the cell highlights both atomic pills and produces a URL the rest of the system already understands.

**Code location.** `frontend/src/components/CameraList.tsx`. Search for the cell-click handler that calls `applyFilters({ filmType: ... })` from a row.

**Effort.** Very small — 3-line change in the click handler. No tests to update (no test framework).

---

## Notes for whoever picks this up

- The frontend has no test framework (no Jest/Vitest/Playwright). Verification is `pnpm lint`, `pnpm build`, and manual checks against the dev server. The same psql / curl one-liners from the original plan still apply for the film-type filter.
- A pre-existing lint error in `frontend/src/app/admin/(authenticated)/users/[id]/page.tsx:65` (React Hook setState in effect) is unrelated to this feature and is also unrelated to these follow-ups; ignore it for these PRs.
- All three items are independent. Ship in any order.
