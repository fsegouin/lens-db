# Community Submissions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to submit missing lenses and cameras, visible immediately with an "unverified" badge, reviewable by admin.

**Architecture:** Add `verified` and `submittedByIp` columns to `lenses` and `cameras` tables. Public submission endpoint creates entries with `verified=false`. Public UI shows unverified badge. Admin edits and flips verified flag.

**Tech Stack:** Next.js 16, Drizzle ORM, PostgreSQL (Neon), Tailwind CSS v4, Upstash Redis rate limiting.

---

### Task 1: Database Migration — Add verified and submittedByIp columns

**Files:**
- Modify: `frontend/src/db/schema.ts`
- Create: Drizzle migration via `pnpm drizzle-kit generate`

**Step 1: Add columns to schema**

In `frontend/src/db/schema.ts`, add to the `lenses` table definition (after the `images` field, before `createdAt`):

```typescript
verified: boolean("verified").default(true).notNull(),
submittedByIp: text("submitted_by_ip"),
```

Add the same two columns to the `cameras` table definition (after `images`, before `createdAt`):

```typescript
verified: boolean("verified").default(true).notNull(),
submittedByIp: text("submitted_by_ip"),
```

**Step 2: Generate migration**

Run: `cd frontend && pnpm drizzle-kit generate`

This will create a migration file in `frontend/drizzle/` that adds the two columns with `DEFAULT true` for existing rows.

**Step 3: Apply migration**

Run: `cd frontend && pnpm drizzle-kit push`

**Step 4: Commit**

```bash
git add frontend/src/db/schema.ts frontend/drizzle/
git commit -m "feat: add verified and submittedByIp columns to lenses and cameras"
```

---

### Task 2: Public API — Submission Endpoint

**Files:**
- Create: `frontend/src/app/api/submissions/route.ts`

**Step 1: Create the submission API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lenses, cameras, blockedIps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getClientIP, hashIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";

const dailyLimiter = createRateLimit(5, "24 h");

function generateSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await dailyLimiter.limit(ip);
  if (!success) return rateLimitedResponse();

  // Check if IP is blocked
  const [blocked] = await db
    .select({ id: blockedIps.id })
    .from(blockedIps)
    .where(eq(blockedIps.ipAddress, ip))
    .limit(1);
  if (blocked) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!["lens", "camera"].includes(body.entityType)) {
    return NextResponse.json({ error: "entityType must be 'lens' or 'camera'" }, { status: 400 });
  }

  const hashedIp = await hashIP(ip);
  const name = body.name.trim().slice(0, 500);
  const slug = generateSlug(name);

  if (body.entityType === "lens") {
    const [created] = await db
      .insert(lenses)
      .values({
        name,
        slug,
        url: typeof body.url === "string" ? body.url.slice(0, 1000) : null,
        brand: typeof body.brand === "string" ? body.brand.slice(0, 200) : null,
        systemId: typeof body.systemId === "number" ? body.systemId : null,
        description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
        lensType: typeof body.lensType === "string" ? body.lensType.slice(0, 100) : null,
        era: typeof body.era === "string" ? body.era.slice(0, 100) : null,
        productionStatus: typeof body.productionStatus === "string" ? body.productionStatus.slice(0, 100) : null,
        focalLengthMin: typeof body.focalLengthMin === "number" ? body.focalLengthMin : null,
        focalLengthMax: typeof body.focalLengthMax === "number" ? body.focalLengthMax : null,
        apertureMin: typeof body.apertureMin === "number" ? body.apertureMin : null,
        apertureMax: typeof body.apertureMax === "number" ? body.apertureMax : null,
        weightG: typeof body.weightG === "number" ? body.weightG : null,
        filterSizeMm: typeof body.filterSizeMm === "number" ? body.filterSizeMm : null,
        minFocusDistanceM: typeof body.minFocusDistanceM === "number" ? body.minFocusDistanceM : null,
        maxMagnification: typeof body.maxMagnification === "number" ? body.maxMagnification : null,
        lensElements: typeof body.lensElements === "number" ? Math.round(body.lensElements) : null,
        lensGroups: typeof body.lensGroups === "number" ? Math.round(body.lensGroups) : null,
        diaphragmBlades: typeof body.diaphragmBlades === "number" ? Math.round(body.diaphragmBlades) : null,
        yearIntroduced: typeof body.yearIntroduced === "number" ? Math.round(body.yearIntroduced) : null,
        yearDiscontinued: typeof body.yearDiscontinued === "number" ? Math.round(body.yearDiscontinued) : null,
        isZoom: body.isZoom === true,
        isMacro: body.isMacro === true,
        isPrime: body.isPrime === true,
        hasStabilization: body.hasStabilization === true,
        hasAutofocus: body.hasAutofocus === true,
        specs: typeof body.specs === "object" && body.specs !== null ? body.specs : {},
        images: [],
        verified: false,
        submittedByIp: hashedIp,
      })
      .returning();

    return NextResponse.json({ slug: created.slug, entityType: "lens" }, { status: 201 });
  }

  // Camera submission
  const [created] = await db
    .insert(cameras)
    .values({
      name,
      slug,
      url: typeof body.url === "string" ? body.url.slice(0, 1000) : null,
      systemId: typeof body.systemId === "number" ? body.systemId : null,
      description: typeof body.description === "string" ? body.description.slice(0, 5000) : null,
      alias: typeof body.alias === "string" ? body.alias.slice(0, 500) : null,
      sensorType: typeof body.sensorType === "string" ? body.sensorType.slice(0, 100) : null,
      sensorSize: typeof body.sensorSize === "string" ? body.sensorSize.slice(0, 100) : null,
      megapixels: typeof body.megapixels === "number" ? body.megapixels : null,
      resolution: typeof body.resolution === "string" ? body.resolution.slice(0, 100) : null,
      yearIntroduced: typeof body.yearIntroduced === "number" ? Math.round(body.yearIntroduced) : null,
      bodyType: typeof body.bodyType === "string" ? body.bodyType.slice(0, 100) : null,
      weightG: typeof body.weightG === "number" ? body.weightG : null,
      specs: typeof body.specs === "object" && body.specs !== null ? body.specs : {},
      images: [],
      verified: false,
      submittedByIp: hashedIp,
    })
    .returning();

  return NextResponse.json({ slug: created.slug, entityType: "camera" }, { status: 201 });
}
```

**Step 2: Commit**

```bash
git add frontend/src/app/api/submissions/route.ts
git commit -m "feat: add public submission API endpoint for lenses and cameras"
```

---

### Task 3: Public UI — Submission Page

**Files:**
- Create: `frontend/src/app/submit/page.tsx` (server component, fetches systems list)
- Create: `frontend/src/components/SubmissionForm.tsx` (client component with lens/camera toggle)

**Step 1: Create the submission form component**

Create `frontend/src/components/SubmissionForm.tsx` — a client component that:
- Has a toggle at the top to switch between "Lens" and "Camera" mode
- Mirrors the fields from `LensForm.tsx` (for lens mode) and `CameraForm.tsx` (for camera mode) but:
  - Removes admin-only fields: `slug`, `url`, `images` (JSON)
  - Keeps all spec fields
- Shows a banner: "Your submission will appear with an 'Unverified' badge until reviewed by an admin."
- On submit, POSTs to `/api/submissions` with `entityType` + all fields
- On success, shows a success message with link to the newly created entry (`/lenses/{slug}` or `/cameras/{slug}`)
- On rate limit error, shows "You've reached the daily submission limit (5 per day)"
- Receives `systems` and `tags` (lensTypes, eras, productionStatuses) as props

Use the same styling constants as the admin forms (`inputClass`, `labelClass`, `sectionClass`). Reuse `ComboboxInput` for classification fields.

**Step 2: Create the submission page**

Create `frontend/src/app/submit/page.tsx`:
- Server component that fetches systems list and tag options from DB
- Renders `<SubmissionForm>` with the data
- Title: "Submit a Missing Lens or Camera"
- Subtitle explaining the community-driven nature
- `generateMetadata` returning `{ title: "Submit | The Lens DB" }`

**Step 3: Commit**

```bash
git add frontend/src/components/SubmissionForm.tsx frontend/src/app/submit/page.tsx
git commit -m "feat: add public submission page for missing lenses and cameras"
```

---

### Task 4: Navigation — Add Submit Entry Point

**Files:**
- Modify: `frontend/src/components/header-nav.tsx`
- Modify: `frontend/src/components/mobile-nav.tsx`

**Step 1: Add "Submit" to navigation**

In `frontend/src/components/header-nav.tsx`, add to the `navLinks` array:
```typescript
{ href: "/submit", label: "Submit" },
```

Do the same in `frontend/src/components/mobile-nav.tsx`.

**Step 2: Commit**

```bash
git add frontend/src/components/header-nav.tsx frontend/src/components/mobile-nav.tsx
git commit -m "feat: add Submit link to header and mobile navigation"
```

---

### Task 5: Unverified Badge — Detail Pages

**Files:**
- Modify: `frontend/src/app/lenses/[slug]/page.tsx`
- Modify: `frontend/src/app/cameras/[...slug]/page.tsx`

**Step 1: Add unverified banner to lens detail page**

In `frontend/src/app/lenses/[slug]/page.tsx`, after the page heading, add a conditional banner:

```tsx
{!result.lens.verified && (
  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
    This entry was submitted by the community and hasn't been verified yet. Information may be incomplete or inaccurate.
  </div>
)}
```

The `verified` field is already available from the `lenses` select.

**Step 2: Add unverified banner to camera detail page**

Same pattern in `frontend/src/app/cameras/[...slug]/page.tsx`.

**Step 3: Commit**

```bash
git add frontend/src/app/lenses/[slug]/page.tsx frontend/src/app/cameras/[...slug]/page.tsx
git commit -m "feat: show unverified banner on community-submitted detail pages"
```

---

### Task 6: Unverified Badge — Listing Pages

**Files:**
- Modify: `frontend/src/components/LensList.tsx`
- Modify: `frontend/src/components/CameraList.tsx`

**Step 1: Add unverified badge to lens list**

In `frontend/src/components/LensList.tsx`, in the table row where the lens name is rendered, add a conditional badge:

```tsx
{!item.lens.verified && (
  <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">
    Unverified
  </Badge>
)}
```

The `verified` field is already part of `lenses.$inferSelect` after the schema change.

**Step 2: Add unverified badge to camera list**

Same pattern in `frontend/src/components/CameraList.tsx`.

**Step 3: Commit**

```bash
git add frontend/src/components/LensList.tsx frontend/src/components/CameraList.tsx
git commit -m "feat: show unverified badge on community-submitted entries in listings"
```

---

### Task 7: Admin — Verified Filter and Toggle

**Files:**
- Modify: `frontend/src/app/admin/lenses/page.tsx` (add verified filter param to admin API call)
- Modify: `frontend/src/app/api/admin/lenses/route.ts` (support `verified` query param in GET)
- Modify: `frontend/src/app/api/admin/cameras/route.ts` (same)
- Modify: `frontend/src/components/admin/LensForm.tsx` (add verified checkbox)
- Modify: `frontend/src/components/admin/CameraForm.tsx` (add verified checkbox)
- Modify: `frontend/src/app/api/admin/lenses/[id]/route.ts` (include verified in PUT)
- Modify: `frontend/src/app/api/admin/cameras/[id]/route.ts` (include verified in PUT)

**Step 1: Add verified filter to admin lens API GET**

In `frontend/src/app/api/admin/lenses/route.ts`, add support for a `verified` query param:

```typescript
const verified = searchParams.get("verified");
// Add to conditions:
if (verified === "true") conditions.push(eq(lenses.verified, true));
if (verified === "false") conditions.push(eq(lenses.verified, false));
```

Also add `verified` to the select fields so it shows in the admin table.

**Step 2: Add verified filter to admin cameras API GET**

Same pattern in cameras admin route.

**Step 3: Add verified checkbox to LensForm**

In `frontend/src/components/admin/LensForm.tsx`:
- Add `verified` to `LensData` interface
- Add state: `const [verified, setVerified] = useState(lens?.verified ?? true);`
- Add to payload: `verified`
- Add a checkbox in the Flags section: "Verified"
- In the PUT handler of `frontend/src/app/api/admin/lenses/[id]/route.ts`, include `verified: body.verified ?? true` in the update values

**Step 4: Add verified checkbox to CameraForm**

Same pattern.

**Step 5: Add verified filter to admin lens list page**

In the admin lenses page, add a select dropdown to filter by verified status (all/verified/unverified). Pass the selected value as `?verified=true|false` to the admin API.

**Step 6: Commit**

```bash
git add frontend/src/app/api/admin/lenses/route.ts frontend/src/app/api/admin/cameras/route.ts \
  frontend/src/components/admin/LensForm.tsx frontend/src/components/admin/CameraForm.tsx \
  frontend/src/app/api/admin/lenses/[id]/route.ts frontend/src/app/api/admin/cameras/[id]/route.ts \
  frontend/src/app/admin/lenses/page.tsx
git commit -m "feat: add verified filter and toggle to admin lens and camera management"
```

---

### Task 8: Build Verification

**Step 1: Run lint**

Run: `cd frontend && pnpm lint`
Expected: No errors

**Step 2: Run build**

Run: `cd frontend && pnpm build`
Expected: Build succeeds

**Step 3: Fix any issues found, commit fixes**
