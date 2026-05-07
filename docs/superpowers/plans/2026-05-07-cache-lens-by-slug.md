# Cache Lens-by-Slug Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the lens detail page (`/lenses/[slug]`) from hitting the Neon database on every dynamic render by caching the lens-by-slug lookup behind `unstable_cache`, so the DB autosuspends and CU-hours drop.

**Architecture:** Move the lens row + system join from inline `db.select()` calls in `src/app/lenses/[slug]/page.tsx` (page body and `generateMetadata`) into a single cached helper `getLensBySlug(slug)` in a new `src/lib/lenses.ts` module. The helper uses `unstable_cache` with a 7-day TTL and a `"lenses"` tag, mirroring the pattern already used in `src/lib/prices.ts` and `src/app/api/systems/route.ts`. Admin edit/delete routes for lenses get a `revalidateTag("lenses")` call alongside the existing `revalidatePath` so cache invalidation lands when an admin edits a lens.

**Tech Stack:** Next.js 16 App Router, `unstable_cache` from `next/cache`, Drizzle ORM, Neon serverless PostgreSQL, TypeScript (strict). No new dependencies.

**Why this scope:** `/lenses/[slug]` had 17k hits in 4 days vs. ~3k for `/lenses` and double-digits for the others. The page is dynamic (because `EbayListings` calls `headers()` for IP-country detection), so every visit re-runs both `generateMetadata` and the page body — two uncached `db.select` calls per visit. That trickle averages one DB query every ~10 seconds and is what's keeping the Neon compute pinned at the 0.25 CU floor 24/7. Caching this single hot path is the smallest change that should let autosuspend fire. The same pattern applies to `/cameras/[...slug]`, `/systems/[slug]`, `/collections/[slug]`, and `/lenses/series/[slug]` — explicitly out of scope here; revisit if Neon usage doesn't drop after this lands.

**Branch:** Create a fresh branch off `main` named `fix/cache-lens-by-slug`.

---

## File Structure

- **Create** `frontend/src/lib/lenses.ts` — exports `getLensBySlug(slug)` returning `{ lens, system } | null`. Wraps the Drizzle query in `unstable_cache`. One responsibility: cached lens-detail data access.
- **Modify** `frontend/src/app/lenses/[slug]/page.tsx` — replace the inline `db.select(...).from(lenses).leftJoin(systems)...` calls (in `generateMetadata` and the page body) with `getLensBySlug(slug)`. Keep the merged-redirect lookup uncached (rare path, not worth caching).
- **Modify** `frontend/src/app/api/admin/lenses/[id]/route.ts` — after the existing `revalidatePath` calls in PUT and DELETE, add `revalidateTag("lenses")` so cached entries flush when an admin edits or deletes a lens.

No tests directory exists in this project (no `vitest`/`jest`/`*.test.*` files anywhere under `frontend/`). Verification is via build, lint, and post-deploy observation of the Neon allocated-compute graph — see Task 4.

---

## Task 1: Create the cached `getLensBySlug` helper

**Files:**
- Create: `frontend/src/lib/lenses.ts`

- [ ] **Step 1: Create `frontend/src/lib/lenses.ts`**

```ts
import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lenses, systems } from "@/db/schema";

export const getLensBySlug = unstable_cache(
  async (slug: string) => {
    const [result] = await db
      .select({ lens: lenses, system: systems })
      .from(lenses)
      .leftJoin(systems, eq(lenses.systemId, systems.id))
      .where(eq(lenses.slug, slug))
      .limit(1);
    return result ?? null;
  },
  ["lens-by-slug"],
  { revalidate: 604800, tags: ["lenses"] },
);
```

Note on the contract: `unstable_cache` automatically includes the function arguments in the cache key, so even though `keyParts` is the constant `["lens-by-slug"]`, each `slug` gets its own cache entry. TTL is 7 days to match the page's existing `revalidate = 604800`. Tag is `"lenses"` so a single `revalidateTag("lenses")` from the admin route clears every lens entry. Returning `null` (not `undefined`) keeps the type narrow and matches how the call sites already destructure.

- [ ] **Step 2: Type-check the new file**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: PASS (no errors). If TypeScript complains about the `[result] = await` destructure when the array is empty, the `?? null` fallback handles it.

- [ ] **Step 3: Commit**

```bash
cd /home/florent/lens-db
git checkout -b fix/cache-lens-by-slug
git add frontend/src/lib/lenses.ts
git commit -m "Add cached getLensBySlug helper"
```

---

## Task 2: Use the helper in the lens detail page

**Files:**
- Modify: `frontend/src/app/lenses/[slug]/page.tsx` (replace two `db.select` blocks)

- [ ] **Step 1: Replace the `generateMetadata` query**

Open `frontend/src/app/lenses/[slug]/page.tsx`. Replace the existing `generateMetadata` (lines 27–42) with:

```tsx
import { getLensBySlug } from "@/lib/lenses";

// ... existing imports ...

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getLensBySlug(slug);

  return {
    title: result ? `${result.lens.name} | The Lens DB` : "Lens Not Found",
  };
}
```

Add the `import { getLensBySlug } from "@/lib/lenses";` line at the top of the file with the other imports. Drop the now-unused `import { eq } from "drizzle-orm"` only if no other code in the file uses `eq` — keep it if anything else (e.g. the `mergedIntoId` redirect lookup) still references it.

- [ ] **Step 2: Replace the page body's lens query**

In the same file, replace the body's lens-and-system query (lines 51–60) with:

```tsx
export default async function LensDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const result = await getLensBySlug(slug);

  if (!result) notFound();

  const { lens, system } = result;

  // Redirect if this entity was merged into another
  if (lens.mergedIntoId) {
    const [target] = await db
      .select({ slug: lenses.slug })
      .from(lenses)
      .where(eq(lenses.id, lens.mergedIntoId))
      .limit(1);
    if (target) redirect(`/lenses/${target.slug}`);
  }

  // ... rest of the page unchanged ...
```

Leave the merged-entity redirect lookup as-is — it's only hit for the rare merged-lens case, not worth caching, and keeps the import for `eq`, `db`, `lenses` alive. If `systems` is no longer imported anywhere else in this file after the swap, drop it from the import on line 6.

- [ ] **Step 3: Type-check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: PASS.

If TypeScript flags an unused import (`systems` from `@/db/schema`), remove just that name from the destructure — keep `lenses`. Don't strip imports that are still used by the merged-redirect block.

- [ ] **Step 4: Lint**

Run: `cd frontend && pnpm lint`
Expected: PASS with no new warnings on `src/app/lenses/[slug]/page.tsx` or `src/lib/lenses.ts`.

- [ ] **Step 5: Local smoke test**

Run: `cd frontend && pnpm dev`
Then in a browser visit `http://localhost:3000/lenses/<any-existing-slug>` (e.g. pick one from `/lenses`). Expected: page renders identically to before. Visit it a second time. Expected: still renders correctly.

If the page returns 404 on a slug you know exists, the destructure of `result` is wrong — re-check that the helper returns `result ?? null` (not `result ?? undefined`) and that the page handles the null case via `notFound()`.

Stop the dev server with Ctrl-C when done.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/lenses/[slug]/page.tsx
git commit -m "Use cached getLensBySlug in lens detail page and metadata"
```

---

## Task 3: Invalidate the cache on admin edits

**Files:**
- Modify: `frontend/src/app/api/admin/lenses/[id]/route.ts`

- [ ] **Step 1: Add `revalidateTag` import and calls**

Open `frontend/src/app/api/admin/lenses/[id]/route.ts`. Update the import on line 2 from:

```ts
import { revalidatePath } from "next/cache";
```

to:

```ts
import { revalidatePath, revalidateTag } from "next/cache";
```

In the PUT handler, immediately after the existing `revalidatePath(\`/lenses/${updated.slug}\`);` (around line 122), add:

```ts
  revalidatePath(`/lenses/${updated.slug}`);
  revalidateTag("lenses");
```

In the DELETE handler, inside the existing `if (deleted) { ... }` block (around line 141–143), add the same `revalidateTag("lenses");` call right after the `revalidatePath`:

```ts
  if (deleted) {
    revalidatePath(`/lenses/${deleted.slug}`);
    revalidateTag("lenses");
  }
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `cd frontend && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/admin/lenses/[id]/route.ts
git commit -m "Invalidate lenses cache tag on admin lens edit/delete"
```

---

## Task 4: Verify and ship

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `cd frontend && pnpm build`
Expected: build succeeds, no new warnings about dynamic-rendering or caching on `/lenses/[slug]`.

In the Next.js build output, confirm `/lenses/[slug]` still shows under the route table (it will be marked dynamic — `f` or `λ` — because of `EbayListings`' `headers()` call; that is expected and unchanged by this PR).

- [ ] **Step 2: Push the branch and open a PR**

```bash
git push -u origin fix/cache-lens-by-slug
gh pr create --title "Cache lens-by-slug lookup to let Neon autosuspend fire" --body "$(cat <<'EOF'
## Summary
- `/lenses/[slug]` is rendered dynamically per request (because `EbayListings` calls `headers()` for marketplace detection), so the inline lens lookup ran on every visit — twice, counting `generateMetadata`. With ~17k hits over 4 days that kept Neon compute pinned at the 0.25 CU floor 24/7 (≈39 CU-h/week, the entire "always-on at minimum" envelope).
- Wraps the lens-by-slug query in `unstable_cache` (7-day TTL, `lenses` tag) following the pattern already used in `src/lib/prices.ts` and `src/app/api/systems/route.ts`.
- Admin lens edit/delete now flushes the tag alongside the existing `revalidatePath`.

## Test plan
- [ ] Build passes (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Smoke: visit a lens detail page in dev — renders correctly, no behavior change
- [ ] Post-deploy: watch Neon Console → Monitoring → Compute over 24h. Expected: allocated drops to 0 during quiet windows for the first time.
- [ ] Post-deploy: edit a lens via `/admin`, confirm the public page reflects the change within seconds (the `revalidateTag` should flush the cache).
EOF
)"
```

- [ ] **Step 3: After deploy, watch Neon for 24h**

Open Neon Console → Project → Monitoring → Compute. Filter to the last 24h after the production deploy lands. Expected: the previously flat-line "allocated 0.25" curve should now have visible gaps where compute drops to 0 (autosuspend kicked in). If it's still flat, the lens lookup wasn't the dominant culprit and we need to extend caching to the other detail pages (`/cameras/[...slug]`, `/systems/[slug]`, `/collections/[slug]`, `/lenses/series/[slug]`) — the same pattern, copy-pasted per entity.

Success criterion (the goal of this whole plan): **`CU-hours / 7d` should drop measurably below 39.** Anything noticeably lower than the 168 × 0.25 = 42 ceiling means autosuspend is firing. A bigger drop is better.

- [ ] **Step 4: Cherry-pick to `feat/new-redesign`**

The redesign branch (`feat/new-redesign`) reintroduces `getCurrentUser()` in the page render path (see `frontend/src/app/lenses/[slug]/page.tsx:86-91` on that branch) — that's a separate dynamic-rendering tax we don't fix here. But the `getLensBySlug` helper from this PR should still be cherry-picked over so the redesign branch benefits when it merges.

```bash
git checkout feat/new-redesign
git cherry-pick <commit-sha-of-task-1>
# Resolve conflicts if any. Re-wire the lens detail page on the redesign
# branch to use the helper (the file structure differs slightly from main).
```

This step is optional — only do it if the redesign isn't shipping immediately. Otherwise just remember to apply the same fix when merging.

---

## Self-Review Notes

- **Spec coverage:** The user asked for caching the lens lookup. Task 1 creates the helper, Task 2 wires it into both call sites (page body + metadata), Task 3 ensures admin edits flush the cache, Task 4 verifies. Out-of-scope items (`/cameras`, `/systems`, `/collections`, `/lenses/series`) are explicitly called out in the architecture section and Task 4 Step 3 as the next move if this isn't enough.
- **No placeholders:** Every code block contains the actual code; every command is concrete; no "add error handling" or "similar to before."
- **Type consistency:** `getLensBySlug` returns `{ lens, system } | null`. The page destructures `const { lens, system } = result;` after a `notFound()` early return — exact match.
- **Naming:** `getLensBySlug` matches the project's existing helpers (`getEntityPriceEstimate`, `getEntityPriceHistory`, `getSystems`).
- **Risk:** If a lens slug changes via admin edit, the old slug's cache entry stays warm for up to 7 days but is unreachable (the new slug returns the data via `revalidateTag`). That's harmless — just a slightly stale entry that ages out. Slug changes are rare in this project.
