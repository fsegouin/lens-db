# Skip Static Page Generation on Preview Builds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ~8,700 statically generated pages on non-production Vercel builds by returning empty arrays from `generateStaticParams()` when `VERCEL_ENV !== "production"`.

**Architecture:** Each of the 5 detail-page routes has a `generateStaticParams()` that queries the database for all slugs. We add a single guard line at the top of each function. Pages remain fully functional on previews via SSR + ISR on first visit.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vercel (`VERCEL_ENV` environment variable)

---

### Task 1: Guard camera detail page

**Files:**
- Modify: `frontend/src/app/cameras/[...slug]/page.tsx:24-27`

- [ ] **Step 1: Add the guard**

Replace the existing `generateStaticParams` function:

```typescript
export async function generateStaticParams() {
  const rows = await db.select({ slug: cameras.slug }).from(cameras);
  return rows.map((r) => ({ slug: r.slug.split("/") }));
}
```

With:

```typescript
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: cameras.slug }).from(cameras);
  return rows.map((r) => ({ slug: r.slug.split("/") }));
}
```

- [ ] **Step 2: Verify the build still works locally**

Run: `cd frontend && pnpm build`
Expected: Build succeeds. The cameras detail route shows 0 pre-rendered pages (since `VERCEL_ENV` is not set locally).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/cameras/[...slug]/page.tsx
git commit -m "Skip static generation for cameras on non-production builds"
```

---

### Task 2: Guard lens detail page

**Files:**
- Modify: `frontend/src/app/lenses/[slug]/page.tsx:26-29`

- [ ] **Step 1: Add the guard**

Replace the existing `generateStaticParams` function:

```typescript
export async function generateStaticParams() {
  const rows = await db.select({ slug: lenses.slug }).from(lenses);
  return rows.map((r) => ({ slug: r.slug }));
}
```

With:

```typescript
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: lenses.slug }).from(lenses);
  return rows.map((r) => ({ slug: r.slug }));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/lenses/[slug]/page.tsx
git commit -m "Skip static generation for lenses on non-production builds"
```

---

### Task 3: Guard lens series detail page

**Files:**
- Modify: `frontend/src/app/lenses/series/[slug]/page.tsx:20-23`

- [ ] **Step 1: Add the guard**

Replace the existing `generateStaticParams` function:

```typescript
export async function generateStaticParams() {
  const rows = await db.select({ slug: lensSeries.slug }).from(lensSeries);
  return rows.map((r) => ({ slug: r.slug }));
}
```

With:

```typescript
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: lensSeries.slug }).from(lensSeries);
  return rows.map((r) => ({ slug: r.slug }));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/lenses/series/[slug]/page.tsx
git commit -m "Skip static generation for lens series on non-production builds"
```

---

### Task 4: Guard systems detail page

**Files:**
- Modify: `frontend/src/app/systems/[slug]/page.tsx:21-24`

- [ ] **Step 1: Add the guard**

Replace the existing `generateStaticParams` function:

```typescript
export async function generateStaticParams() {
  const rows = await db.select({ slug: systems.slug }).from(systems);
  return rows.map((r) => ({ slug: r.slug }));
}
```

With:

```typescript
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: systems.slug }).from(systems);
  return rows.map((r) => ({ slug: r.slug }));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/systems/[slug]/page.tsx
git commit -m "Skip static generation for systems on non-production builds"
```

---

### Task 5: Guard collections detail page

**Files:**
- Modify: `frontend/src/app/collections/[slug]/page.tsx:20-23`

- [ ] **Step 1: Add the guard**

Replace the existing `generateStaticParams` function:

```typescript
export async function generateStaticParams() {
  const rows = await db.select({ slug: collections.slug }).from(collections);
  return rows.map((r) => ({ slug: r.slug }));
}
```

With:

```typescript
export async function generateStaticParams() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const rows = await db.select({ slug: collections.slug }).from(collections);
  return rows.map((r) => ({ slug: r.slug }));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/collections/[slug]/page.tsx
git commit -m "Skip static generation for collections on non-production builds"
```

---

### Task 6: Verify all changes together

- [ ] **Step 1: Run lint**

Run: `cd frontend && pnpm lint`
Expected: No lint errors.

- [ ] **Step 2: Run a full build without VERCEL_ENV**

Run: `cd frontend && pnpm build`
Expected: Build succeeds. All 5 detail routes show 0 pre-rendered pages. List pages and other routes are unaffected.

- [ ] **Step 3: Run a full build with VERCEL_ENV=production**

Run: `cd frontend && VERCEL_ENV=production pnpm build`
Expected: Build succeeds. All 5 detail routes pre-render their full page sets (~8,700 total).
