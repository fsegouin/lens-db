# Admin Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload images to camera and lens edit pages via drag-drop, clipboard image, or pasted URL; reorder via drag-and-drop; delete; plus a "missing images" filter on admin list pages.

**Architecture:** A shared `r2-upload.ts` module (sharp 500x500 webp → R2 PutObject) is consumed by both the existing `enrich-*.mjs` scripts and three new admin API routes per entity (POST/PUT/DELETE on `/api/admin/{type}/[id]/images`). A client `<ImageUploader>` component, embedded in `CameraForm` / `LensForm`, handles file drop, clipboard paste (image data or URL), client-side resize to ≤2000px, and `@dnd-kit/sortable` reorder. Existing `AdminTable` filter prop wires up a "Missing images" select on the list pages.

**Tech Stack:** Next.js 16 App Router (Node runtime for routes), Drizzle ORM (Neon Postgres), `sharp` for server resize, `@aws-sdk/client-s3` for R2, `@dnd-kit/sortable` for reorder, `nanoid` for collision-resistant key suffixes.

**Spec:** `docs/superpowers/specs/2026-04-27-admin-image-upload-design.md`

**Test infra note:** This project has no test runner (only `pnpm lint`). Smoke testing in this plan uses `pnpm lint`, ad-hoc `node` scripts hitting `localhost:3000` while `pnpm dev` runs in another terminal, and final manual browser verification via Chrome MCP. TDD with `*.test.ts` files is not applicable here.

---

## Task 1: Add dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

Run from `frontend/`:
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities nanoid
```

Expected: `package.json` gains the four packages under `dependencies`. Lockfile updated.

- [ ] **Step 2: Verify lint still passes (baseline check)**

Run from `frontend/`:
```bash
pnpm lint
```

Expected: same lint output as before adding deps (1 pre-existing error in `users/[id]/page.tsx:65`, ~17 warnings). No new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "Add @dnd-kit and nanoid for image uploader"
```

---

## Task 2: Create shared `r2-upload.ts` module

**Files:**
- Create: `frontend/src/lib/r2-upload.ts`

- [ ] **Step 1: Write the module**

Create `frontend/src/lib/r2-upload.ts` with:

```ts
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_URL,
} = process.env;

let cachedClient: S3Client | null = null;
function client(): S3Client {
  if (cachedClient) return cachedClient;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error("Missing R2 env vars (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME/R2_PUBLIC_URL)");
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return cachedClient;
}

export function publicUrlFor(r2Key: string): string {
  if (!R2_PUBLIC_URL) throw new Error("Missing R2_PUBLIC_URL");
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

export async function objectExists(r2Key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: r2Key }));
    return true;
  } catch {
    return false;
  }
}

export async function processAndUpload(buffer: Buffer, r2Key: string): Promise<string> {
  const resized = await sharp(buffer)
    .resize(500, 500, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await client().send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
    Body: resized,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return publicUrlFor(r2Key);
}

export async function fetchAndUpload(sourceUrl: string, r2Key: string): Promise<string> {
  const resp = await fetch(sourceUrl, {
    headers: { "User-Agent": "lens-db-image-upload/1.0 (https://lens-db.com)" },
  });
  if (!resp.ok) throw new Error(`fetch ${sourceUrl} -> ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}
```

- [ ] **Step 2: Lint check**

Run from `frontend/`:
```bash
pnpm lint
```

Expected: no new errors in `src/lib/r2-upload.ts`.

- [ ] **Step 3: Smoke test from a temporary node script**

Create `frontend/scripts/smoke-r2-upload.mjs`:

```js
import "dotenv/config";
import { fetchAndUpload, objectExists } from "../src/lib/r2-upload.ts";

const key = `_smoke/${Date.now()}.webp`;
const url = "https://upload.wikimedia.org/wikipedia/commons/2/24/Canon_EOS_20Da.jpg";
console.log("uploading", url, "->", key);
const publicUrl = await fetchAndUpload(url, key);
console.log("public:", publicUrl);
console.log("exists:", await objectExists(key));
```

Note: the import of a `.ts` file from `.mjs` works only via a TS-aware loader. Skip this script and instead use the verification in Task 3 (the refactored `enrich-canon-missing-images.mjs --dry-run` exercises the same code path). Delete the smoke script if you created it:

```bash
rm -f frontend/scripts/smoke-r2-upload.mjs
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/r2-upload.ts
git commit -m "Add shared r2-upload module for sharp+R2 pipeline"
```

---

## Task 3: Refactor existing scripts to use the shared module

**Files:**
- Modify: `frontend/scripts/enrich-existing-cameras.mjs`
- Modify: `frontend/scripts/enrich-existing-lenses.mjs`
- Create: `frontend/scripts/enrich-canon-missing-images.mjs` (move from main worktree)

**Note on importing from `.ts` from `.mjs`:** Node ≥ 22 with `--experimental-strip-types` can import TypeScript directly. To keep scripts simple, **duplicate the small subset of `r2-upload.ts` logic into a `.mjs` mirror** at `frontend/scripts/lib/r2-upload.mjs` and have all three scripts import from there. This avoids tooling churn while still consolidating the implementation.

- [ ] **Step 1: Create the `.mjs` mirror**

Create `frontend/scripts/lib/r2-upload.mjs` with the same logic as Task 2's TS file but as plain JS:

```js
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  throw new Error("Missing R2 env vars");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

export const R2_PUBLIC = R2_PUBLIC_URL;

export function publicUrlFor(r2Key) {
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

export async function objectExists(r2Key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: r2Key }));
    return true;
  } catch { return false; }
}

export async function processAndUpload(buffer, r2Key) {
  const resized = await sharp(buffer)
    .resize(500, 500, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME, Key: r2Key, Body: resized,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return publicUrlFor(r2Key);
}

export async function fetchAndUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl, {
    headers: { "User-Agent": "lens-db-image-upload/1.0 (https://lens-db.com)" },
  });
  if (!resp.ok) throw new Error(`fetch ${sourceUrl} -> ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}
```

- [ ] **Step 2: Refactor `enrich-existing-cameras.mjs`**

In `frontend/scripts/enrich-existing-cameras.mjs`, replace lines 9-11, 17-24, 33-54 (the local sharp/S3/objectExists/downloadResizeUpload setup) with an import from the shared module. Keep the rest of the script intact.

The replacement for lines 9-11 + 17-24 + 33-54:

```js
import { neon } from "@neondatabase/serverless";
import { objectExists, processAndUpload, R2_PUBLIC } from "./lib/r2-upload.mjs";
import fs from "fs";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes('--dry-run');

async function downloadResizeUpload(sourceUrl, r2Key) {
  const resp = await fetch(sourceUrl);
  if (!resp.ok) return null;
  const buffer = Buffer.from(await resp.arrayBuffer());
  return processAndUpload(buffer, r2Key);
}
```

Then replace the literal `${R2_PUBLIC_URL}` usages in the rest of the file with `${R2_PUBLIC}` (it's the same value, just imported under a different name).

- [ ] **Step 3: Refactor `enrich-existing-lenses.mjs` (same pattern)**

Apply the same replacement to `frontend/scripts/enrich-existing-lenses.mjs` (mirror of cameras script).

- [ ] **Step 4: Move + refactor `enrich-canon-missing-images.mjs`**

This script lives on `main` worktree (`/home/florent/lens-db/frontend/scripts/enrich-canon-missing-images.mjs`) as untracked. Copy it into the current worktree:

```bash
cp /home/florent/lens-db/frontend/scripts/enrich-canon-missing-images.mjs frontend/scripts/enrich-canon-missing-images.mjs
```

Then refactor it the same way: replace local sharp/S3/objectExists/downloadResizeUpload with imports from `./lib/r2-upload.mjs`. The `r2KeyForSlug` helper and the `items` array stay as-is.

- [ ] **Step 5: Smoke-test by dry-running**

Run from `frontend/`:
```bash
set -a && source .env.local && set +a && node scripts/enrich-canon-missing-images.mjs --dry-run
```

Expected: same output as before (10 entries, "DRY RUN: would upload..." for each, no actual uploads or DB writes). No import errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts/lib/r2-upload.mjs frontend/scripts/enrich-existing-cameras.mjs frontend/scripts/enrich-existing-lenses.mjs frontend/scripts/enrich-canon-missing-images.mjs
git commit -m "Refactor enrich scripts to use shared r2-upload module"
```

---

## Task 4: Camera image upload endpoint (POST + PUT + DELETE)

**Files:**
- Create: `frontend/src/app/api/admin/cameras/[id]/images/route.ts`

This file holds all three methods for camera images.

- [ ] **Step 1: Write the route file**

Create `frontend/src/app/api/admin/cameras/[id]/images/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { cameras } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { processAndUpload, fetchAndUpload, publicUrlFor } from "@/lib/r2-upload";

export const runtime = "nodejs";

type ImageData = { src: string; alt: string };

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RAW_BYTES = 10 * 1024 * 1024;

function r2KeyFor(slug: string): string {
  const tail = slug.replace(/^camera\//, "");
  return `cameras/${tail}/${Date.now()}-${nanoid(6)}.webp`;
}

async function loadCamera(id: number) {
  const row = await db.select().from(cameras).where(eq(cameras.id, id)).then((r) => r[0]);
  return row || null;
}

async function appendImage(id: number, image: ImageData): Promise<ImageData[]> {
  const cam = await loadCamera(id);
  if (!cam) throw new Error("not found");
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  const updated = [...current, image];
  await db.update(cameras).set({ images: updated }).where(eq(cameras.id, id));
  return updated;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") || "";
  const r2Key = r2KeyFor(cam.slug);
  let publicUrl: string;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 415 });
      }
      if (file.size > MAX_RAW_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      publicUrl = await processAndUpload(buffer, r2Key);
    } else if (contentType.startsWith("application/json")) {
      const body = await request.json();
      if (typeof body.url !== "string") {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
      }
      try { new URL(body.url); } catch {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 });
      }
      publicUrl = await fetchAndUpload(body.url, r2Key);
    } else {
      return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 415 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const updated = await appendImage(id, { src: publicUrl, alt: cam.name });
  return NextResponse.json({ images: updated });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  if (!Array.isArray(body.srcs) || body.srcs.some((s: unknown) => typeof s !== "string")) {
    return NextResponse.json({ error: "Body must be { srcs: string[] }" }, { status: 400 });
  }

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  const currentSrcs = current.map((i) => i.src).sort();
  const submittedSrcs = [...body.srcs].sort();
  if (currentSrcs.length !== submittedSrcs.length || currentSrcs.some((s, i) => s !== submittedSrcs[i])) {
    return NextResponse.json({ error: "Srcs do not match current images" }, { status: 409 });
  }
  const bySrc = new Map(current.map((i) => [i.src, i]));
  const reordered = body.srcs.map((s: string) => bySrc.get(s)!);
  await db.update(cameras).set({ images: reordered }).where(eq(cameras.id, id));
  return NextResponse.json({ images: reordered });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  if (typeof body.src !== "string") {
    return NextResponse.json({ error: "Body must be { src: string }" }, { status: 400 });
  }

  const cam = await loadCamera(id);
  if (!cam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(cam.images) ? cam.images : []) as ImageData[];
  const updated = current.filter((i) => i.src !== body.src);
  await db.update(cameras).set({ images: updated }).where(eq(cameras.id, id));
  return NextResponse.json({ images: updated });
}
```

The unused `publicUrlFor` import can be removed if your editor flags it.

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

Expected: no new errors in the new file.

- [ ] **Step 3: Start dev server**

In a separate terminal, run from `frontend/`:
```bash
pnpm dev
```

Wait until "Ready in" log line appears. Leave running.

- [ ] **Step 4: Smoke-test POST with a URL**

Pick a camera id that currently has empty images (e.g. id 3156 from the recent backfill — confirm with `psql` or one of the existing scripts). Get an admin session cookie by logging into `http://localhost:3000/admin/login` in a browser; copy the `user_session` cookie value.

Then run:
```bash
COOKIE='user_session=<paste value>'
curl -s -X POST http://localhost:3000/api/admin/cameras/3156/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d '{"url":"https://upload.wikimedia.org/wikipedia/commons/2/24/Canon_EOS_20Da.jpg"}' | jq .
```

Expected: `{ "images": [{ "src": "https://pub-...r2.dev/cameras/...-<nano>.webp", "alt": "..." }] }`. R2 object retrievable via `curl -I` on the src URL → 200.

- [ ] **Step 5: Smoke-test POST with a file**

```bash
curl -s -O https://upload.wikimedia.org/wikipedia/commons/2/24/Canon_EOS_20Da.jpg
curl -s -X POST http://localhost:3000/api/admin/cameras/3156/images \
  -H "$COOKIE" -F "file=@Canon_EOS_20Da.jpg" | jq .
rm Canon_EOS_20Da.jpg
```

Expected: `images` array now has 2 entries.

- [ ] **Step 6: Smoke-test PUT (reorder)**

Take the two srcs returned in step 5, swap their order, then:
```bash
curl -s -X PUT http://localhost:3000/api/admin/cameras/3156/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d '{"srcs":["<src2>","<src1>"]}' | jq .
```

Expected: `images` array returned in the new order.

- [ ] **Step 7: Smoke-test DELETE**

```bash
curl -s -X DELETE http://localhost:3000/api/admin/cameras/3156/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d '{"src":"<src1>"}' | jq .
```

Expected: only the other image remains in the response.

- [ ] **Step 8: Smoke-test PUT with mismatched srcs (should 409)**

```bash
curl -s -X PUT http://localhost:3000/api/admin/cameras/3156/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d '{"srcs":["nonsense"]}' -o /dev/stderr -w "%{http_code}\n"
```

Expected: `409` with `{"error":"Srcs do not match current images"}`.

- [ ] **Step 9: Cleanup test data**

Reset id 3156 to empty images:
```bash
set -a && source .env.local && set +a && node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`UPDATE cameras SET images = '[]'::jsonb WHERE id = 3156\`.then(() => console.log('done'));
"
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/api/admin/cameras/\[id\]/images/route.ts
git commit -m "Add admin POST/PUT/DELETE for camera images"
```

---

## Task 5: Lens image upload endpoint (mirror)

**Files:**
- Create: `frontend/src/app/api/admin/lenses/[id]/images/route.ts`

- [ ] **Step 1: Write the file**

The lens route is structurally identical to the camera route in Task 4 — only the imports and `r2KeyFor` change.

```ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { lenses } from "@/db/schema";
import { requireAdminAPI } from "@/lib/admin-auth";
import { processAndUpload, fetchAndUpload } from "@/lib/r2-upload";

export const runtime = "nodejs";

type ImageData = { src: string; alt: string };

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RAW_BYTES = 10 * 1024 * 1024;

function r2KeyFor(slug: string): string {
  const tail = slug.replace(/^lens\//, "");
  return `lenses/${tail}/${Date.now()}-${nanoid(6)}.webp`;
}

async function loadLens(id: number) {
  const row = await db.select().from(lenses).where(eq(lenses.id, id)).then((r) => r[0]);
  return row || null;
}

async function appendImage(id: number, image: ImageData): Promise<ImageData[]> {
  const lens = await loadLens(id);
  if (!lens) throw new Error("not found");
  const current = (Array.isArray(lens.images) ? lens.images : []) as ImageData[];
  const updated = [...current, image];
  await db.update(lenses).set({ images: updated }).where(eq(lenses.id, id));
  return updated;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const lens = await loadLens(id);
  if (!lens) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = request.headers.get("content-type") || "";
  const r2Key = r2KeyFor(lens.slug);
  let publicUrl: string;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: `Unsupported type ${file.type}` }, { status: 415 });
      }
      if (file.size > MAX_RAW_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      publicUrl = await processAndUpload(buffer, r2Key);
    } else if (contentType.startsWith("application/json")) {
      const body = await request.json();
      if (typeof body.url !== "string") {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
      }
      try { new URL(body.url); } catch {
        return NextResponse.json({ error: "Invalid url" }, { status: 400 });
      }
      publicUrl = await fetchAndUpload(body.url, r2Key);
    } else {
      return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 415 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const updated = await appendImage(id, { src: publicUrl, alt: lens.name });
  return NextResponse.json({ images: updated });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  if (!Array.isArray(body.srcs) || body.srcs.some((s: unknown) => typeof s !== "string")) {
    return NextResponse.json({ error: "Body must be { srcs: string[] }" }, { status: 400 });
  }

  const lens = await loadLens(id);
  if (!lens) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(lens.images) ? lens.images : []) as ImageData[];
  const currentSrcs = current.map((i) => i.src).sort();
  const submittedSrcs = [...body.srcs].sort();
  if (currentSrcs.length !== submittedSrcs.length || currentSrcs.some((s, i) => s !== submittedSrcs[i])) {
    return NextResponse.json({ error: "Srcs do not match current images" }, { status: 409 });
  }
  const bySrc = new Map(current.map((i) => [i.src, i]));
  const reordered = body.srcs.map((s: string) => bySrc.get(s)!);
  await db.update(lenses).set({ images: reordered }).where(eq(lenses.id, id));
  return NextResponse.json({ images: reordered });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get("user_session")?.value;
  const authError = await requireAdminAPI(token);
  if (authError) return authError;

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json();
  if (typeof body.src !== "string") {
    return NextResponse.json({ error: "Body must be { src: string }" }, { status: 400 });
  }

  const lens = await loadLens(id);
  if (!lens) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = (Array.isArray(lens.images) ? lens.images : []) as ImageData[];
  const updated = current.filter((i) => i.src !== body.src);
  await db.update(lenses).set({ images: updated }).where(eq(lenses.id, id));
  return NextResponse.json({ images: updated });
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

- [ ] **Step 3: Smoke-test (POST URL only — the rest is identical to camera route)**

Pick an existing lens id (e.g. 1):
```bash
curl -s -X POST http://localhost:3000/api/admin/lenses/1/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d '{"url":"https://upload.wikimedia.org/wikipedia/commons/2/24/Canon_EOS_20Da.jpg"}' | jq .
```

Expected: response includes a new image at `lenses/<lens-slug>/<timestamp>-<nano>.webp`.

Cleanup: `UPDATE lenses SET images = images - <indexOfNewlyAdded>` is awkward; easier to manually remove via a one-off SQL or delete via the new DELETE endpoint:

```bash
curl -s -X DELETE http://localhost:3000/api/admin/lenses/1/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d "{\"src\":\"<src from POST response>\"}" | jq .
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/admin/lenses/\[id\]/images/route.ts
git commit -m "Add admin POST/PUT/DELETE for lens images"
```

---

## Task 6: Add `missing_images` filter to admin list endpoints

**Files:**
- Modify: `frontend/src/app/api/admin/cameras/route.ts`
- Modify: `frontend/src/app/api/admin/lenses/route.ts`

- [ ] **Step 1: Modify cameras GET**

In `frontend/src/app/api/admin/cameras/route.ts`, after the line that reads `q`:

```ts
const q = searchParams.get("q");
```

Add:
```ts
const missingImages = searchParams.get("missing_images") === "1";
```

Then, where `conditions` is built (after the name/alias `or(...)` block), append:

```ts
if (missingImages) {
  conditions.push(
    sql`(jsonb_typeof(${cameras.images}) <> 'array' OR jsonb_array_length(${cameras.images}) = 0)`
  );
}
```

`sql` is already imported from `drizzle-orm`.

- [ ] **Step 2: Modify lenses GET**

In `frontend/src/app/api/admin/lenses/route.ts`, do the same: parse `missing_images` from `searchParams` and append the same `sql` clause to the conditions, but using `lenses.images` instead of `cameras.images`. The lens route will already have `sql` imported from drizzle-orm — confirm and add if missing.

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

- [ ] **Step 4: Smoke-test cameras filter**

```bash
curl -s "http://localhost:3000/api/admin/cameras?missing_images=1" -H "$COOKIE" | jq '.total, (.items | length)'
```

Expected: `total` is small (the count of cameras with empty/null images, currently 13 + the 10 we just reverted = some ~13-23 depending on what else is missing); `.items | length` ≤ 50.

- [ ] **Step 5: Smoke-test lenses filter**

```bash
curl -s "http://localhost:3000/api/admin/lenses?missing_images=1" -H "$COOKIE" | jq '.total, (.items | length)'
```

Expected: similar shape; `total` is the count of lenses without images.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/admin/cameras/route.ts frontend/src/app/api/admin/lenses/route.ts
git commit -m "Add missing_images filter to admin cameras+lenses list APIs"
```

---

## Task 7: Client-side image resize utility

**Files:**
- Create: `frontend/src/lib/client-image-resize.ts`

- [ ] **Step 1: Write the utility**

Create `frontend/src/lib/client-image-resize.ts`:

```ts
const MAX_EDGE = 2000;

export async function resizeImageBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/webp",
      0.9,
    );
  });
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/client-image-resize.ts
git commit -m "Add client-side image resize utility (canvas -> webp 2000px)"
```

---

## Task 8: ImageUploader component — drop zone + thumbnails

**Files:**
- Create: `frontend/src/components/admin/ImageUploader.tsx`

This task implements the drop zone, list of thumbnails, the read-only JSON `<details>`, and the upload flow (without reorder, delete, or clipboard yet — those come in Tasks 9 and 10).

- [ ] **Step 1: Write the initial component**

Create `frontend/src/components/admin/ImageUploader.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { resizeImageBlob } from "@/lib/client-image-resize";

type ImageData = { src: string; alt: string };

interface Props {
  entityType: "cameras" | "lenses";
  entityId: number;
  entityName: string;
  initialImages: ImageData[];
  onChange?: (images: ImageData[]) => void;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function ImageUploader({
  entityType,
  entityId,
  entityName,
  initialImages,
  onChange,
}: Props) {
  const [images, setImages] = useState<ImageData[]>(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateImages = useCallback(
    (next: ImageData[]) => {
      setImages(next);
      onChange?.(next);
    },
    [onChange],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES.has(file.type)) {
        setError(`Unsupported type ${file.type}`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("File too large (max 10 MB)");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const resized = await resizeImageBlob(file);
        const formData = new FormData();
        formData.append("file", resized, "upload.webp");
        const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
          method: "POST",
          body: formData,
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
        const data = await resp.json();
        updateImages(data.images);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [entityType, entityId, updateImages],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      for (const file of Array.from(e.dataTransfer.files)) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      for (const file of Array.from(e.target.files || [])) {
        void uploadFile(file);
      }
      e.target.value = "";
    },
    [uploadFile],
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500"
      >
        <p className="mb-2">Drag and drop images here</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg bg-zinc-900 px-3 py-1 text-white text-xs hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          disabled={busy}
        >
          {busy ? "Uploading…" : "Choose file"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={onFilePick}
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((img) => (
            <div key={img.src} className="relative aspect-square overflow-hidden rounded border border-zinc-200 dark:border-zinc-700">
              <Image src={img.src} alt={img.alt || entityName} fill sizes="100px" className="object-cover" />
            </div>
          ))}
        </div>
      )}

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer">Show raw JSON</summary>
        <pre className="mt-2 overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-800">
          {JSON.stringify(images, null, 2)}
        </pre>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/ImageUploader.tsx
git commit -m "Add ImageUploader skeleton (drop zone + thumbnails + raw JSON)"
```

---

## Task 9: Add reorder + delete to ImageUploader

**Files:**
- Modify: `frontend/src/components/admin/ImageUploader.tsx`

- [ ] **Step 1: Replace the thumbnail grid with a sortable grid**

In `ImageUploader.tsx`:

1. Add imports at the top:

```tsx
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

2. Add a `Thumbnail` subcomponent above the default export:

```tsx
function Thumbnail({
  img,
  entityName,
  onDelete,
}: {
  img: ImageData;
  entityName: string;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: img.src });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="relative aspect-square overflow-hidden rounded border border-zinc-200 dark:border-zinc-700">
      <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <Image src={img.src} alt={img.alt || entityName} fill sizes="100px" className="object-cover" />
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white hover:bg-black/80"
        aria-label="Remove image"
      >
        ×
      </button>
    </div>
  );
}
```

3. Add a `deleteImage` callback inside `ImageUploader`:

```tsx
const deleteImage = useCallback(
  async (src: string) => {
    if (!confirm("Remove this image?")) return;
    setError(null);
    try {
      const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
      const data = await resp.json();
      updateImages(data.images);
    } catch (e) {
      setError((e as Error).message);
    }
  },
  [entityType, entityId, updateImages],
);
```

4. Add a `handleDragEnd` callback:

```tsx
const handleDragEnd = useCallback(
  async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = images.findIndex((i) => i.src === active.id);
    const newIndex = images.findIndex((i) => i.src === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(images, oldIndex, newIndex);
    updateImages(reordered);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ srcs: reordered.map((i) => i.src) }),
      });
      if (!resp.ok) {
        // 409 or other → refetch authoritative state
        const data = await resp.json().catch(() => ({}));
        setError(data.error || "Reorder failed");
        // Best-effort: revert by reloading via the change handler — caller refetches if it cares.
        updateImages(images);
      } else {
        const data = await resp.json();
        updateImages(data.images);
      }
    } catch (e) {
      setError((e as Error).message);
      updateImages(images);
    }
  },
  [images, entityType, entityId, updateImages],
);
```

5. Replace the existing thumbnail grid block with:

```tsx
{images.length > 0 && (
  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={images.map((i) => i.src)} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {images.map((img) => (
          <Thumbnail
            key={img.src}
            img={img}
            entityName={entityName}
            onDelete={() => void deleteImage(img.src)}
          />
        ))}
      </div>
    </SortableContext>
  </DndContext>
)}
```

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/admin/ImageUploader.tsx
git commit -m "Add @dnd-kit reorder and delete to ImageUploader"
```

---

## Task 10: Add clipboard support to ImageUploader

**Files:**
- Modify: `frontend/src/components/admin/ImageUploader.tsx`

- [ ] **Step 1: Add a clipboard handler and "Read from clipboard" button**

Inside `ImageUploader`, add:

```tsx
const uploadUrl = useCallback(
  async (url: string) => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/${entityType}/${entityId}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
      const data = await resp.json();
      updateImages(data.images);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  },
  [entityType, entityId, updateImages],
);

const readFromClipboard = useCallback(async () => {
  setError(null);
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        const file = new File([blob], "clipboard.png", { type: imageType });
        await uploadFile(file);
        return;
      }
    }
    // No image — try text as URL
    const text = await navigator.clipboard.readText();
    try { new URL(text); } catch {
      setError("Clipboard has no image or URL");
      return;
    }
    await uploadUrl(text);
  } catch (e) {
    setError(`Clipboard read failed: ${(e as Error).message}`);
  }
}, [uploadFile, uploadUrl]);

const onPaste = useCallback(
  async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const fileItem = items.find((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (fileItem) {
      const file = fileItem.getAsFile();
      if (file) {
        e.preventDefault();
        await uploadFile(file);
        return;
      }
    }
    const textItem = items.find((it) => it.kind === "string" && it.type === "text/plain");
    if (textItem) {
      textItem.getAsString(async (text) => {
        try { new URL(text); } catch { return; }
        await uploadUrl(text);
      });
    }
  },
  [uploadFile, uploadUrl],
);
```

- [ ] **Step 2: Wire `onPaste` and the new button into the drop zone**

Update the drop zone JSX:

```tsx
<div
  onDragOver={(e) => e.preventDefault()}
  onDrop={onDrop}
  onPaste={onPaste}
  tabIndex={0}
  className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400"
>
  <p className="mb-2">Drag and drop images here, or paste (Cmd/Ctrl+V)</p>
  <div className="flex flex-wrap items-center justify-center gap-2">
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className="rounded-lg bg-zinc-900 px-3 py-1 text-white text-xs hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      disabled={busy}
    >
      {busy ? "Uploading…" : "Choose file"}
    </button>
    <button
      type="button"
      onClick={readFromClipboard}
      className="rounded-lg border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      disabled={busy}
    >
      Read from clipboard
    </button>
  </div>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    multiple
    className="hidden"
    onChange={onFilePick}
  />
</div>
```

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/ImageUploader.tsx
git commit -m "Add clipboard image and URL paste support to ImageUploader"
```

---

## Task 11: Wire ImageUploader into CameraForm

**Files:**
- Modify: `frontend/src/components/admin/CameraForm.tsx`

- [ ] **Step 1: Remove the existing JSON `images` state and textarea**

Delete these lines:
- The `images` state and the related parse/error logic in the submit handler (around lines 67, 90-96)
- `images: parsedImages,` from the body object (line ~115)
- The entire `{/* Images */}` section block (lines ~366-378)

Keep the `images?: unknown` prop — it's still used to seed the uploader.

- [ ] **Step 2: Add the new section**

Import:

```tsx
import ImageUploader from "@/components/admin/ImageUploader";
```

And in the props/state block, derive `initialImages`:

```tsx
const initialImages = (Array.isArray(camera?.images) ? camera.images : []) as { src: string; alt: string }[];
```

Replace the deleted Images section with:

```tsx
{/* Images */}
<section className="space-y-4">
  <h3 className={sectionClass}>Images</h3>
  {camera?.id ? (
    <ImageUploader
      entityType="cameras"
      entityId={camera.id}
      entityName={camera?.name || ""}
      initialImages={initialImages}
    />
  ) : (
    <p className="text-sm text-zinc-500">Save the camera first to enable image uploads.</p>
  )}
</section>
```

(Confirm the `Camera` prop type exposes `id?: number`. It already does in `CameraFormProps`.)

- [ ] **Step 3: Lint check**

```bash
pnpm lint
```

- [ ] **Step 4: Smoke-test in browser**

Open `http://localhost:3000/admin/cameras/3156/edit` (use a camera id you own). The Images section now shows the uploader. Drop a small JPEG to verify upload works and the thumbnail appears.

Cleanup any test image:
```bash
curl -s -X DELETE http://localhost:3000/api/admin/cameras/3156/images \
  -H "$COOKIE" -H "Content-Type: application/json" \
  -d '{"src":"<src from thumbnail>"}'
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/CameraForm.tsx
git commit -m "Wire ImageUploader into CameraForm"
```

---

## Task 12: Wire ImageUploader into LensForm

**Files:**
- Modify: `frontend/src/components/admin/LensForm.tsx`

- [ ] **Step 1: Apply the same edits as Task 11, mirrored for lenses**

Replace the `images` JSON state, the parse logic, the body field, and the textarea section with the same `ImageUploader` block but `entityType="lenses"` and using `lens?.id`/`lens?.name`/`lens?.images`.

- [ ] **Step 2: Lint check**

```bash
pnpm lint
```

- [ ] **Step 3: Smoke-test in browser**

Open an existing lens edit page (e.g. `/admin/lenses/1/edit`), upload a test image, confirm thumbnail appears, then delete it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/admin/LensForm.tsx
git commit -m "Wire ImageUploader into LensForm"
```

---

## Task 13: Add "Missing images" filter to admin list pages

**Files:**
- Modify: `frontend/src/app/admin/(authenticated)/cameras/page.tsx`
- Modify: `frontend/src/app/admin/(authenticated)/lenses/page.tsx`

- [ ] **Step 1: Add the filter to the cameras page**

In `frontend/src/app/admin/(authenticated)/cameras/page.tsx`, define filters and pass to `AdminTable`:

```tsx
const filters = [
  {
    key: "missing_images",
    label: "Images",
    options: [
      { value: "", label: "Any" },
      { value: "1", label: "Missing" },
    ],
  },
];

// in the AdminTable JSX:
<AdminTable
  title="Cameras"
  apiPath="/api/admin/cameras"
  editPath="/admin/cameras"
  columns={columns}
  filters={filters}
  newHref="/admin/cameras/new"
  bulkActions={bulkActions}
/>
```

- [ ] **Step 2: Mirror on the lenses page**

Apply the same in `frontend/src/app/admin/(authenticated)/lenses/page.tsx`.

- [ ] **Step 3: Lint + browser smoke-test**

```bash
pnpm lint
```

In the browser, open `/admin/cameras`. The header now has an "Images" select. Pick "Missing" and confirm only entries without images are listed (count should match the API smoke check from Task 6).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/\(authenticated\)/cameras/page.tsx frontend/src/app/admin/\(authenticated\)/lenses/page.tsx
git commit -m "Add Missing images filter to admin cameras+lenses lists"
```

---

## Task 14: End-to-end browser verification + capture GIF

**Files:** none

- [ ] **Step 1: Verify each interaction in a fresh browser window**

Make sure `pnpm dev` is running. Pick a camera and lens you can mutate freely (or use newly created throwaway entries).

For both **cameras** and **lenses**:

1. List page: filter to "Missing", confirm count matches API.
2. Edit page: drop a JPEG → thumbnail appears.
3. Edit page: paste an image (Cmd/Ctrl+V) → thumbnail appears.
4. Edit page: click "Read from clipboard" with an image URL on clipboard → thumbnail appears.
5. Edit page: drag a thumbnail to a new position → order persists across page reload.
6. Edit page: click × on a thumbnail → confirm dialog → image removed.
7. Edit page (new entity): images section shows the disabled "Save first" placeholder.
8. Edit page: expand "Show raw JSON" → see the JSONB array shown read-only.

Note any failures and create a follow-up task or fix in place.

- [ ] **Step 2: Capture a short GIF of the camera flow**

Use Chrome MCP `gif_creator` with `pnpm dev` running. Record (a) drop upload, (b) reorder, (c) delete, on the camera edit page. Save as `docs/superpowers/specs/admin-image-upload.gif`.

- [ ] **Step 3: Reset any test data**

Delete throwaway uploads from R2 isn't required (orphans are accepted policy). Delete from DB via the admin DELETE button or:
```bash
set -a && source .env.local && set +a && node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql\`UPDATE cameras SET images = '[]'::jsonb WHERE id IN (<your test ids>)\`.then(() => console.log('done'));
"
```

- [ ] **Step 4: Commit GIF (if recorded)**

```bash
git add docs/superpowers/specs/admin-image-upload.gif
git commit -m "Add demo gif for admin image upload"
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "Admin image upload for cameras and lenses" --body "$(cat <<'EOF'
## Summary
- Drag-and-drop / clipboard / URL upload on camera and lens admin edit pages
- Drag-to-reorder thumbnails, click × to delete (R2 orphans accepted)
- "Missing images" filter on `/admin/cameras` and `/admin/lenses`
- Shared `r2-upload` lib consumed by both the new admin routes and the existing `enrich-*.mjs` scripts

Spec: `docs/superpowers/specs/2026-04-27-admin-image-upload-design.md`

## Test plan
- [ ] List filter: "Missing" toggle on cameras and lenses
- [ ] Upload via file drop
- [ ] Upload via Cmd/Ctrl+V image paste
- [ ] Upload via "Read from clipboard" with URL on clipboard
- [ ] Reorder via drag → persists across reload
- [ ] Delete via × → DB removed, R2 object stays
- [ ] New-entity edit page shows "Save first" placeholder
- [ ] Existing `enrich-canon-missing-images.mjs --dry-run` still runs
EOF
)"
```

---

## Self-review

**Spec coverage:**
- Shared `r2-upload.ts` → Task 2
- `.mjs` mirror for scripts → Task 3
- Camera POST/PUT/DELETE → Task 4
- Lens POST/PUT/DELETE → Task 5
- `missing_images` filter on list APIs → Task 6
- Client-side resize ≤2000px → Task 7
- ImageUploader (drop, thumbs, JSON disclosure) → Task 8
- Reorder + delete → Task 9
- Clipboard image + URL → Task 10
- CameraForm wiring + save-first placeholder → Task 11
- LensForm wiring → Task 12
- AdminTable filter UI on both list pages → Task 13
- E2E verification + GIF + PR → Task 14

**Type consistency:**
- `ImageData` shape `{ src: string; alt: string }` used consistently across server route, ImageUploader props, and `client-image-resize` (which doesn't reference it but doesn't conflict).
- `r2KeyFor(slug)` used in both camera and lens routes with `cameras/...` and `lenses/...` prefixes; consistent with existing R2 layout.
- `entityType` typed as `"cameras" | "lenses"` in both component props and embedded usage.

**Placeholder scan:** No "TBD"/"TODO"/"implement later"/"add appropriate". All steps include either exact code, exact commands with expected output, or clear smoke-test instructions tied to specific endpoints.

**Open notes:**
- The R2 `Bucket` arg passes `R2_BUCKET_NAME` directly. If the env var is missing at request time, the route returns a 500 with the error message. Acceptable for an admin-only feature.
- Concurrency race on JSONB append is documented in the spec as accepted; no mitigation in this plan.
- The reorder revert path on 409 is best-effort (`updateImages(images)` after async error) — true authoritative refresh would refetch from the server. Acceptable since 409 is rare and the user can reload.
