# Admin Table State Preservation

## Problem

1. Saving a camera or lens form navigates back to the table with all state lost (search, filters, sort, page).
2. The lenses admin table uses an "Any/Missing" dropdown for the images filter, while cameras uses a checkbox. They should be consistent.

## Design

### AdminTable: sync state to URL params

AdminTable currently stores all state in `useState`. Change it to:

- **Initialize from URL**: on mount, read `q`, `sort`, `order`, `page`, and any filter keys from `useSearchParams()`.
- **Sync to URL on change**: whenever search, filter, sort, or page changes, call `router.replace()` with the updated query string. Use `replace` (not `push`) so incremental changes (e.g. typing in search) don't pollute browser history. Only include non-default values in the URL (omit empty `q`, page 0, empty filters).

URL shape example: `/admin/cameras?q=nikon&missing_images=1&sort=name&order=desc&page=2`

### Edit/New links: pass `returnTo` param

- AdminTable's edit links (column 0) and the "+ New" button append a `returnTo` search param containing the current table query string (URL-encoded).
- Example: `/admin/cameras/42/edit?returnTo=q%3Dnikon%26missing_images%3D1%26sort%3Dname%26order%3Ddesc%26page%3D2`

### Forms: redirect back with preserved state

- CameraForm and LensForm receive an optional `returnTo` prop (the raw query string).
- On save, `router.push("/admin/{cameras|lenses}?" + returnTo)` instead of the bare path.
- On delete, same behavior.
- The forms don't interpret the params — they just pass them through.

### Edit/New pages: thread `returnTo` through

- The edit page components (`cameras/[id]/edit/page.tsx`, `lenses/[id]/edit/page.tsx`) read `returnTo` from their own `searchParams` and pass it to the form component.
- Same for the `new/page.tsx` pages.

### Lens table: checkbox filter

Change the lenses page filter config from:
```ts
{
  key: "missing_images",
  label: "Images",
  options: [
    { value: "", label: "Any" },
    { value: "1", label: "Missing" },
  ],
}
```
To:
```ts
{ key: "missing_images", label: "Show lenses with missing images", type: "checkbox" as const }
```

## Files to modify

| File | Change |
|------|--------|
| `components/admin/AdminTable.tsx` | Read initial state from URL params; sync state changes to URL via `router.replace()`; add `returnTo` to edit links and new button href |
| `components/admin/CameraForm.tsx` | Accept `returnTo` prop; use it in redirect after save/delete |
| `components/admin/LensForm.tsx` | Accept `returnTo` prop; use it in redirect after save/delete |
| `app/admin/(authenticated)/cameras/[id]/edit/page.tsx` | Read `returnTo` from searchParams, pass to CameraForm |
| `app/admin/(authenticated)/cameras/new/page.tsx` | Read `returnTo` from searchParams, pass to CameraForm |
| `app/admin/(authenticated)/lenses/[id]/edit/page.tsx` | Read `returnTo` from searchParams, pass to LensForm |
| `app/admin/(authenticated)/lenses/new/page.tsx` | Read `returnTo` from searchParams, pass to LensForm |
| `app/admin/(authenticated)/lenses/page.tsx` | Change filter config from dropdown to checkbox |

## Out of scope

- Other admin tables (collections, systems, series) — can adopt the same pattern later if needed.
- Persisting state across sessions (localStorage) — URL params are sufficient.
