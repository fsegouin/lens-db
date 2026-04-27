# Admin Image Upload — Design

**Date:** 2026-04-27
**Branch:** `feature/admin-image-upload`
**Worktree:** `.worktrees/admin-image-upload`

## Goal

Let admins attach images to cameras and lenses directly from the edit form (drag-and-drop, clipboard paste, or paste URL), with thumbnails reorderable in the carousel and removable. Add a "missing images" filter to the admin list pages so admins can find entries that need attention.

## Non-goals

- Per-image alt text editing (auto-set to entity name; revisit if accessibility audits flag it)
- R2 orphan cleanup (delete only removes from DB; R2 objects stay)
- Bulk upload across entities (one entity at a time)
- Cross-entity drag-to-import
- Persisting filter state in URL params
- Server-side dedup of identical content under different keys
- Image upload during initial entity creation (must save once to get an ID first)

## Architecture

### New shared module: `src/lib/r2-upload.ts`

Extracted from existing `scripts/enrich-existing-{cameras,lenses}.mjs`. Pure utility, no Next/Edge dependencies, importable from API routes and `.mjs` scripts. Exports:

- `processAndUpload(buffer: Buffer, r2Key: string): Promise<string>` — runs sharp resize 500x500 webp (quality 80, `fit: 'inside'`, `withoutEnlargement: true`), PUTs to R2, returns the public URL.
- `fetchAndUpload(sourceUrl: string, r2Key: string): Promise<string>` — fetches the URL with a `User-Agent` header, then `processAndUpload`.
- `objectExists(key: string): Promise<boolean>` — HEAD check.

### New API routes

All admin-session-protected via the existing `requireAdminAPI()` helper.

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/admin/cameras/[id]/images` | `multipart/form-data` with field `file` **or** `application/json` `{ url: string }` (server dispatches by `Content-Type`) | Append one image |
| POST | `/api/admin/lenses/[id]/images` | same | Append one image |
| PUT | `/api/admin/cameras/[id]/images` | `{ srcs: string[] }` JSON | Reorder; srcs must match existing set exactly |
| PUT | `/api/admin/lenses/[id]/images` | same | Reorder |
| DELETE | `/api/admin/cameras/[id]/images` | `{ src: string }` JSON | Remove one image (DB only; R2 stays) |
| DELETE | `/api/admin/lenses/[id]/images` | same | Remove one image |

All return `{ images: ImageData[] }` (the updated array) on success.

### List filter

Add `?missing_images=1` query param to existing `GET /api/admin/cameras` and `/api/admin/lenses`. SQL clause:

```sql
AND (jsonb_typeof(images) <> 'array' OR jsonb_array_length(images) = 0)
```

`AdminTable` already supports a `filters` prop with select dropdowns. Add to both list pages:

```ts
{ key: "missing_images", label: "Images", options: [
  { value: "", label: "Any" },
  { value: "1", label: "Missing" },
]}
```

### New client component: `src/components/admin/ImageUploader.tsx`

Props:
- `entityType: "cameras" | "lenses"`
- `entityId: number`
- `entityName: string`
- `initialImages: ImageData[]`
- `onChange?: (images: ImageData[]) => void` — called after every successful mutation

Internal:
- `react-dropzone` style drop zone (no need for the lib; native HTML5 drag events suffice — `react-dropzone` would be overkill for one zone)
- `@dnd-kit/sortable` for the thumbnail grid reorder
- "Read from clipboard" button + `paste` event on the zone, both calling the same handler
- Per-thumbnail × button with `confirm()` dialog
- Inline error region under the zone for the most recent error

Embedded in `CameraForm.tsx` and `LensForm.tsx`, replacing the current JSON textarea Images section. On the "new" page (no `entityId`), render a disabled placeholder with the message "Save first to enable image uploads."

Below the uploader, a `<details>` disclosure labelled "Show raw JSON" reveals a **read-only** monospace `<pre>` of the current `images` JSONB (pretty-printed). For inspection / copy-paste / debugging only — there is no edit affordance and no save path. The uploader remains the sole writer.

## Data flow

### Upload (drop or clipboard image)

1. User drops a file onto the zone, or clicks "Read from clipboard" / presses Cmd/Ctrl+V.
2. Client validates: type ∈ `{image/jpeg, image/png, image/webp}`, raw size ≤ 10 MB. Otherwise inline error, abort.
3. Client resizes to ≤2000px max edge using `<canvas>`/`createImageBitmap` and re-encodes as `image/webp` quality 0.9. Result is typically ≤ ~1.5 MB, well under Vercel's 4.5 MB function-body cap.
4. POST as `multipart/form-data` with field name `file` to `/api/admin/{type}/[id]/images`.
5. Server: `requireAdminAPI()` → reads file via `request.formData()` → `processAndUpload(buffer, key)` where `key = ${type}/<entity-slug-without-prefix>/${Date.now()}-${nanoid(6)}.webp`. The nanoid suffix prevents collisions if two uploads land in the same millisecond.
6. Server appends `{ src: publicUrl, alt: entity.name }` to `images` JSONB and returns the updated array.
7. Client replaces local state with server response.

### Upload (clipboard URL or paste URL string)

1. User clicks "Read from clipboard" with a URL on clipboard, or pastes a URL into the zone.
2. Client detects it's a string that parses as a URL (using `new URL()`).
3. POST `{ url }` as `application/json` to the same endpoint.
4. Server fetches the URL with a User-Agent, runs `processAndUpload`, appends to `images`, returns array.

### Reorder

- Drag updates local state immediately (optimistic).
- On drop, PUT `{ srcs: [...new order...] }` to the endpoint.
- Server validates that the submitted srcs are exactly the set currently in the DB (no add/remove). Then writes the reordered array.
- If the validation fails (e.g., a concurrent modification removed an image), the server rejects with 409 and the client refetches.

### Delete

- × button → `confirm()` → DELETE `{ src }`.
- Server filters the array, updates DB. Does not delete the R2 object.

## Error UX

- Validation failures (wrong type, oversize, no clipboard image, malformed URL): inline red message under the zone, no upload attempted.
- Network or server failure on upload: inline red message; the failed thumbnail does not persist. Other concurrent uploads continue independently.
- Reorder conflict (409): client refetches images, restores correct order, shows a brief "Reorder failed, refreshed" message.

## Concurrency

Multiple files dropped → fired as parallel `fetch` calls. Race condition exists if two requests for the same entity arrive simultaneously, since each appends to `images` JSONB after a read-modify-write. For single-admin usage this is acceptable. If it becomes a problem, switch to a SQL-level concat using `jsonb_build_array` || existing or use a row-level lock.

## File constraints

| Constraint | Value | Where enforced |
|---|---|---|
| Allowed types | jpeg, png, webp | Client + server |
| Max raw size | 10 MB | Client (rejects), server (rejects as a backstop) |
| Output dimensions | 500x500 max (`fit: 'inside'`) | Server (sharp) |
| Output format | webp quality 80 | Server (sharp) |
| HEIC support | Not in v1 | (libvips-heif not installed) |

## Backfill script refactor (in scope)

Three scripts refactored to import the shared `r2-upload.ts`:
- `scripts/enrich-existing-cameras.mjs`
- `scripts/enrich-existing-lenses.mjs`
- `scripts/enrich-canon-missing-images.mjs` (currently untracked on `main`; moves into this branch)

No behavior changes; pure refactor.

## Dependencies

New:
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — drag-and-drop reorder
- `nanoid` — collision-resistant key suffix

Already installed:
- `sharp`, `@aws-sdk/client-s3` (used by existing scripts)

## Schema / migrations

None. `images JSONB DEFAULT '[]'` already exists on both `cameras` and `lenses`.

## Testing

Manual browser verification via Chrome MCP on the worktree dev server, capturing a short GIF for the PR:
1. Upload a file (drop)
2. Paste an image (Cmd+V)
3. Paste a URL string
4. Drag-to-reorder thumbnails
5. Delete a thumbnail
6. Toggle the "Missing" filter on `/admin/cameras` and `/admin/lenses`

Server-side: small `node` smoke tests for each endpoint (POST file, POST URL, PUT reorder, DELETE) before browser testing.

## Files touched

New:
- `src/lib/r2-upload.ts`
- `src/app/api/admin/cameras/[id]/images/route.ts`
- `src/app/api/admin/lenses/[id]/images/route.ts`
- `src/components/admin/ImageUploader.tsx`
- `docs/superpowers/specs/2026-04-27-admin-image-upload-design.md` (this file)

Modified:
- `src/components/admin/CameraForm.tsx` (replace JSON textarea section)
- `src/components/admin/LensForm.tsx` (replace JSON textarea section)
- `src/app/admin/(authenticated)/cameras/page.tsx` (add filter)
- `src/app/admin/(authenticated)/lenses/page.tsx` (add filter)
- `src/app/api/admin/cameras/route.ts` (read `missing_images` param)
- `src/app/api/admin/lenses/route.ts` (read `missing_images` param)
- `scripts/enrich-existing-cameras.mjs` (use shared lib)
- `scripts/enrich-existing-lenses.mjs` (use shared lib)
- `scripts/enrich-canon-missing-images.mjs` (use shared lib; move into branch)
- `package.json` (new deps)

## Open risks

- **Race on JSONB append** under concurrent uploads (accepted; rare in single-admin use).
- **Vercel body limit** — 10 MB raw → ~1.5 MB after client resize, comfortable margin. If a future user uploads from a phone with a 50 MB HEIC, the client validator catches it before the server ever sees it.
- **Clipboard API browser support** — `navigator.clipboard.read()` requires a secure context (HTTPS or localhost) and modern browsers. Firefox supports it as of recent versions. Acceptable for an admin tool.
