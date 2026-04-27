# Skip Static Page Generation on Non-Production Builds

## Problem

Every Vercel build — including preview deploys for PRs and branches — pre-generates ~8,700 static pages via `generateStaticParams()`. This burns significant build minutes on non-production deployments where those pre-built pages provide no value.

## Solution

Add an early-return guard to each `generateStaticParams()` function that returns an empty array when `VERCEL_ENV` is not `production`. Pages remain fully functional on previews — they render on-demand via SSR and are cached via ISR on subsequent visits.

## Files to Modify

| File | Entity | Approx. pages skipped |
|------|--------|-----------------------|
| `frontend/src/app/cameras/[...slug]/page.tsx` | Cameras | ~1,000 |
| `frontend/src/app/lenses/[slug]/page.tsx` | Lenses | ~7,400 |
| `frontend/src/app/lenses/series/[slug]/page.tsx` | Lens series | ~150 |
| `frontend/src/app/systems/[slug]/page.tsx` | Systems | ~130 |
| `frontend/src/app/collections/[slug]/page.tsx` | Collections | ~50 |

## Implementation

Each `generateStaticParams()` receives the same one-line guard at the top:

```typescript
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];

  // existing slug query and return unchanged
}
```

## What Does Not Change

- **Production builds**: Identical behavior — all ~8,700 pages pre-generated as before.
- **ISR configuration**: `revalidate = 604800` (7 days) remains on all detail pages.
- **`dynamicParams`**: Defaults to `true` on all routes, so ungenerated slugs render on-demand.
- **List pages, API routes, dynamic pages**: No changes.
- **Database migrations, build scripts**: No changes.

## Behavior on Preview Deploys

- `generateStaticParams()` returns `[]` for all detail routes.
- Zero static pages are pre-generated (apart from non-parameterized static pages like the homepage).
- Visiting any detail page triggers SSR on first request. ISR caches the result for subsequent visits.
- No functional difference from the user's perspective — pages load and work normally.

## Expected Impact

- Preview build time reduced significantly (eliminates ~8,700 page generations and their associated DB queries).
- Vercel build minutes cost reduced proportionally for all non-production deployments.
- No risk to production builds.
