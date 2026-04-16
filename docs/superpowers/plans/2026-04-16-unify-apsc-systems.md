# Unify APS-C Systems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge APS-C system variants into their full-frame parent systems and add a `coverage` field to lenses indicating image circle size (full-frame, APS-C, etc.).

**Architecture:** Add a `coverage` text column to the `lenses` table. Write a SQL migration that (1) adds the column, (2) sets `coverage = 'aps-c'` for lenses currently in APS-C-only systems, (3) reassigns those lenses and cameras to the parent system, (4) merges view counts, (5) deletes the now-empty APS-C system entries. Update the Drizzle schema, scraper, admin forms, public filters, and API routes to support the new field.

**Tech Stack:** PostgreSQL (Drizzle ORM), Next.js 16 (App Router), TypeScript, Python (scraper)

---

### Task 1: SQL Migration — Add coverage column and merge APS-C systems

**Files:**
- Create: `frontend/drizzle/0012_unify_apsc_systems.sql`

The migration uses system names (not IDs) so it works regardless of the actual database IDs. Statements referencing non-existent systems are safe no-ops.

**Verified merge pairs from database (same physical mount, APS-C variant → parent):**
| APS-C system | ID | Lenses | Cameras | Parent system | Parent ID |
|---|---|---|---|---|---|
| Canon EF-S | 108 | 24 | 33 | Canon EF | 119 |
| Canon RF-S | 417 | 3 | 1 | Canon RF | 75 |
| Nikon F APS-C | 168 | 0 | 5 | Nikon F | 39 |
| Nikon Z APS-C | 394 | 2 | 1 | Nikon Z | 9 |
| Sony E APS-C | 181 | 2 | 15 | Sony E | 23 |
| Sony A APS-C | 182 | 11 | 8 | Minolta/Sony A | 94 |
| Pentax K APS-C | 172 | 1 | 25 | Pentax K | 139 |
| Sigma SA APS-C | 180 | 0 | 4 | Sigma SA | 179 |
| Leica L APS-C | 163 | 0 | 6 | Leica L | 109 |
| Konica Minolta A APS-C | 386 | 0 | 0 | Minolta/Sony A | 94 |

**APS-C-only systems (stay as-is, just tag their lenses):**
- Fujifilm X (46, 200 lenses), Canon EF-M (87, 145 lenses), Samsung NX (19, 18 lenses), Samsung NX-M (416, 10 lenses)

**Not APS-C (leave alone):**
- Nikon 1 (414, 1-inch sensor), Pentax Q (415, tiny sensor), Micro Four Thirds (412), Four Thirds (413)

- [ ] **Step 1: Write the migration SQL**

```sql
-- Unify APS-C system variants into their full-frame parent systems.
-- Add a "coverage" column to lenses to track image circle size independently.
-- System names verified against production database on 2026-04-16.

BEGIN;

-- 1. Add coverage column to lenses
ALTER TABLE lenses ADD COLUMN IF NOT EXISTS coverage text;

-- 2. Tag lenses in APS-C-specific systems BEFORE merging
-- (a) Lenses in systems that will be merged into a parent
UPDATE lenses SET coverage = 'aps-c'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Canon EF-S', 'Canon RF-S',
    'Nikon Z APS-C', 'Nikon F APS-C',
    'Sony E APS-C', 'Sony A APS-C',
    'Pentax K APS-C', 'Sigma SA APS-C',
    'Leica L APS-C', 'Konica Minolta A APS-C'
  )
);

-- (b) Lenses in APS-C-only systems (no FF parent — these systems stay)
UPDATE lenses SET coverage = 'aps-c'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Fujifilm X', 'Canon EF-M',
    'Samsung NX', 'Samsung NX-M'
  )
);

-- (c) Micro Four Thirds lenses get their own coverage value
UPDATE lenses SET coverage = 'micro-four-thirds'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Micro Four Thirds', 'Four Thirds'
  )
);

-- 3. Reassign lenses from APS-C systems to parent systems
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Canon EF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon EF-S');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Canon RF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon RF-S');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Nikon Z')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon Z APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Nikon F')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon F APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Sony E')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony E APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony A APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Pentax K')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Pentax K APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Sigma SA')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sigma SA APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Leica L')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Leica L APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Konica Minolta A APS-C');

-- 4. Reassign cameras from APS-C systems to parent systems
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Canon EF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon EF-S');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Canon RF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon RF-S');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Nikon Z')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon Z APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Nikon F')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon F APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Sony E')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony E APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony A APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Pentax K')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Pentax K APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Sigma SA')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sigma SA APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Leica L')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Leica L APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Konica Minolta A APS-C');

-- 5. Merge view counts into parent systems
UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Canon EF-S'), 0)
WHERE name = 'Canon EF';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Canon RF-S'), 0)
WHERE name = 'Canon RF';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Nikon Z APS-C'), 0)
WHERE name = 'Nikon Z';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Nikon F APS-C'), 0)
WHERE name = 'Nikon F';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Sony E APS-C'), 0)
WHERE name = 'Sony E';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Sony A APS-C'), 0)
  + COALESCE((SELECT view_count FROM systems WHERE name = 'Konica Minolta A APS-C'), 0)
WHERE name = 'Minolta/Sony A';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Pentax K APS-C'), 0)
WHERE name = 'Pentax K';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Sigma SA APS-C'), 0)
WHERE name = 'Sigma SA';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Leica L APS-C'), 0)
WHERE name = 'Leica L';

-- 6. Delete the now-empty APS-C system entries
DELETE FROM systems WHERE name IN (
  'Canon EF-S', 'Canon RF-S',
  'Nikon Z APS-C', 'Nikon F APS-C',
  'Sony E APS-C', 'Sony A APS-C',
  'Pentax K APS-C', 'Sigma SA APS-C',
  'Leica L APS-C', 'Konica Minolta A APS-C'
);

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/drizzle/0012_unify_apsc_systems.sql
git commit -m "Add migration to unify APS-C systems into parent mounts"
```

---

### Task 2: Update Drizzle schema — add coverage field to lenses

**Files:**
- Modify: `frontend/src/db/schema.ts:30-82` (lenses table definition)

- [ ] **Step 1: Add coverage field to the lenses table**

In `frontend/src/db/schema.ts`, add the `coverage` field to the lenses table definition, after the `hasAutofocus` field (line 61):

```typescript
    hasAutofocus: boolean("has_autofocus").default(false),
    coverage: text("coverage"), // "full-frame" | "aps-c" | "micro-four-thirds" | null (unknown)
```

- [ ] **Step 2: Run drizzle-kit to verify schema sync**

Run: `cd frontend && pnpm drizzle-kit generate`
Expected: A new migration file is generated (or "No schema changes" if we handle the column in the manual migration). If a new migration is generated, check it only contains `ALTER TABLE lenses ADD COLUMN coverage text` and delete it (since our manual migration 0012 already handles this).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/db/schema.ts
git commit -m "Add coverage field to lenses schema"
```

---

### Task 3: Update scraper — normalize APS-C mount names and set coverage

**Files:**
- Modify: `scraper/import_to_db.py:503-517` (parse_mount_name function)
- Modify: `scraper/import_to_db.py:640-690` (lens import phase)

- [ ] **Step 1: Add a mount normalization map and coverage detection function**

After the `parse_mount_name` function (~line 517), add:

```python
# Mapping from APS-C mount names to their parent mount + coverage
APSC_MOUNT_MAP = {
    "Canon EF-S": ("Canon EF", "aps-c"),
    "Canon RF-S": ("Canon RF", "aps-c"),
    "Nikon Z APS-C": ("Nikon Z", "aps-c"),
    "Nikon F APS-C": ("Nikon F", "aps-c"),
    "Sony E APS-C": ("Sony E", "aps-c"),
    "Sony A APS-C": ("Minolta/Sony A", "aps-c"),
    "Pentax K APS-C": ("Pentax K", "aps-c"),
    "Sigma SA APS-C": ("Sigma SA", "aps-c"),
    "Leica L APS-C": ("Leica L", "aps-c"),
    "Konica Minolta A APS-C": ("Minolta/Sony A", "aps-c"),
}

# Systems that are entirely APS-C (no FF parent)
APSC_ONLY_SYSTEMS = {"Fujifilm X", "Canon EF-M", "Samsung NX", "Samsung NX-M"}
MFT_SYSTEMS = {"Micro Four Thirds", "Four Thirds"}


def normalize_mount(raw_name: str) -> tuple[str, str | None]:
    """Normalize an APS-C mount name to its parent and return coverage.

    Returns (system_name, coverage) where coverage is 'aps-c',
    'micro-four-thirds', or None (unknown / full-frame).
    """
    if raw_name in APSC_MOUNT_MAP:
        return APSC_MOUNT_MAP[raw_name]
    if raw_name in APSC_ONLY_SYSTEMS:
        return (raw_name, "aps-c")
    if raw_name in MFT_SYSTEMS:
        return (raw_name, "micro-four-thirds")
    return (raw_name, None)
```

- [ ] **Step 2: Update the lens INSERT to include coverage**

In the lens import section, find where `parse_mount_name` is called and the lens row is constructed. After extracting the mount name, call `normalize_mount`:

```python
        raw_mount = parse_mount_name(specs)
        if raw_mount:
            mount_name, coverage = normalize_mount(raw_mount)
            system_id = get_or_create_system(cur, mount_name, system_cache)
        else:
            system_id = None
            coverage = None
```

Then include `coverage` in the INSERT statement for lenses. Find the existing INSERT and add `coverage` to the column list and values.

- [ ] **Step 3: Update the CREATE TABLE statement for lenses in the scraper**

Find the `CREATE TABLE IF NOT EXISTS lenses` statement in `import_to_db.py` and add:

```sql
    coverage TEXT,
```

after the `has_autofocus` column.

- [ ] **Step 4: Commit**

```bash
git add scraper/import_to_db.py
git commit -m "Normalize APS-C mount names and set coverage in scraper"
```

---

### Task 4: Update admin lens form — add coverage dropdown

**Files:**
- Modify: `frontend/src/components/admin/LensForm.tsx:7-38` (LensData interface)
- Modify: `frontend/src/components/admin/LensForm.tsx:55-130` (form state)
- Modify: `frontend/src/components/admin/LensForm.tsx:244-320` (form JSX, Basic Info section)
- Modify: `frontend/src/components/admin/LensForm.tsx:175-205` (payload construction)

- [ ] **Step 1: Add coverage to the LensData interface**

In `LensForm.tsx`, add to the `LensData` interface after `hasAutofocus`:

```typescript
  hasAutofocus?: boolean | null;
  coverage?: string | null;
```

- [ ] **Step 2: Add coverage state**

After the `hasAutofocus` state (~line 122), add:

```typescript
  const [coverage, setCoverage] = useState(lens?.coverage ?? "");
```

- [ ] **Step 3: Add coverage to the payload**

In the `handleSubmit` payload object, add after `hasAutofocus`:

```typescript
      hasAutofocus,
      coverage: coverage || null,
```

- [ ] **Step 4: Add coverage dropdown in the Classification section**

In the Classification section (after the Production Status combobox, ~line 349), add a fourth grid item:

```typescript
          <div className="space-y-1">
            <label className={labelClass}>Coverage</label>
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
              className={`w-full ${inputClass}`}
            >
              <option value="">-- Unknown --</option>
              <option value="full-frame">Full Frame</option>
              <option value="aps-c">APS-C</option>
              <option value="micro-four-thirds">Micro Four Thirds</option>
              <option value="medium-format">Medium Format</option>
            </select>
          </div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/LensForm.tsx
git commit -m "Add coverage dropdown to admin lens form"
```

---

### Task 5: Update admin lens API — handle coverage field in CRUD

**Files:**
- Modify: `frontend/src/app/api/admin/lenses/[id]/route.ts` (GET response and PUT handler)
- Modify: `frontend/src/app/api/admin/lenses/route.ts` (POST handler)

- [ ] **Step 1: Add coverage to the GET response**

In the admin lens GET handler (`/api/admin/lenses/[id]/route.ts`), find where the lens fields are returned and ensure `coverage` is included. Since `lenses.*` is selected, it should already be included via the schema change. Verify this is the case.

- [ ] **Step 2: Add coverage to the PUT handler**

In the PUT handler, find where the update fields are extracted from the request body. Add `coverage`:

```typescript
    const { name, slug, url, brand, systemId, description, lensType, era, productionStatus,
      focalLengthMin, focalLengthMax, apertureMin, apertureMax, weightG, filterSizeMm,
      minFocusDistanceM, maxMagnification, lensElements, lensGroups, diaphragmBlades,
      yearIntroduced, yearDiscontinued, isZoom, isMacro, isPrime,
      hasStabilization, hasAutofocus, coverage, specs, images } = body;
```

And include `coverage` in the update object:

```typescript
      coverage,
```

- [ ] **Step 3: Add coverage to the POST handler**

Same pattern in the POST handler in `route.ts` — extract `coverage` from the body and include it in the insert.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/admin/lenses/route.ts frontend/src/app/api/admin/lenses/\[id\]/route.ts
git commit -m "Handle coverage field in admin lens API"
```

---

### Task 6: Update public lens API — expose coverage and add filter

**Files:**
- Modify: `frontend/src/app/api/lenses/route.ts:16-66` (add coverage param and filter)

- [ ] **Step 1: Add coverage query parameter extraction**

After the `system` param extraction (~line 20), add:

```typescript
  const coverage = searchParams.get("coverage") || undefined;
```

- [ ] **Step 2: Add coverage filter condition**

After the system filter condition (~line 66), add:

```typescript
    if (coverage) {
      conditions.push(eq(lenses.coverage, coverage));
    }
```

The `lenses.coverage` column is already included in the select since we select `lenses.*`. No other changes needed — the response already returns the full lens object.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/lenses/route.ts
git commit -m "Add coverage filter to public lenses API"
```

---

### Task 7: Update LensList component — add coverage filter dropdown

**Files:**
- Modify: `frontend/src/components/LensList.tsx` (add coverage filter dropdown and display)

- [ ] **Step 1: Add coverage to URL params and filter state**

Find where URL params are read from `searchParams` (~after line 50). Add:

```typescript
  const coverage = searchParams.get("coverage") || "";
```

- [ ] **Step 2: Add coverage to the updateParam calls and API URL construction**

Find where the API URL is constructed for fetching lenses (look for the `fetch` call that builds URL params). Add `coverage` to the URL params:

```typescript
    if (coverage) url.searchParams.set("coverage", coverage);
```

- [ ] **Step 3: Add coverage dropdown in the filters section**

Find the filters section (near the system dropdown). Add a coverage filter dropdown after it:

```typescript
          <select
            value={coverage}
            onChange={(e) => updateParam("coverage", e.target.value)}
            className={selectClass}
          >
            <option value="">All coverage</option>
            <option value="full-frame">Full Frame</option>
            <option value="aps-c">APS-C</option>
            <option value="micro-four-thirds">Micro Four Thirds</option>
            <option value="medium-format">Medium Format</option>
          </select>
```

- [ ] **Step 4: Display coverage badge in the lens table rows**

Find where the system name is displayed in each table row. After the system badge, add a coverage badge when present:

```typescript
{row.lens.coverage && (
  <Badge variant="outline" className="text-xs">
    {row.lens.coverage === "aps-c" ? "APS-C"
      : row.lens.coverage === "full-frame" ? "FF"
      : row.lens.coverage === "micro-four-thirds" ? "MFT"
      : row.lens.coverage === "medium-format" ? "MF"
      : row.lens.coverage}
  </Badge>
)}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LensList.tsx
git commit -m "Add coverage filter and badge to lens list"
```

---

### Task 8: Update lenses page server component — pass coverage to filters

**Files:**
- Modify: `frontend/src/app/lenses/page.tsx:39-59` (SearchParams type)
- Modify: `frontend/src/app/lenses/page.tsx:87-148` (conditions)

- [ ] **Step 1: Add coverage to SearchParams type**

```typescript
type SearchParams = Promise<{
  // ... existing params ...
  coverage?: string;
  // ...
}>;
```

- [ ] **Step 2: Add coverage filter condition**

After the system condition (~line 106), add:

```typescript
    if (params.coverage) {
      conditions.push(eq(lenses.coverage, params.coverage));
    }
```

Add `lenses` to the drizzle `eq` import if not already there (it is).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/lenses/page.tsx
git commit -m "Add coverage filter to lenses page server component"
```

---

### Task 9: Update submit form — add coverage field for lenses

**Files:**
- Modify: `frontend/src/app/submit/SubmitForm.tsx:11-38` (lensFields array)

- [ ] **Step 1: Add coverage to the lens fields**

In the `lensFields` array, after the `systemId` field (~line 15), add:

```typescript
  { name: "coverage", label: "Coverage", type: "select",
    options: [
      { value: "full-frame", label: "Full Frame" },
      { value: "aps-c", label: "APS-C" },
      { value: "micro-four-thirds", label: "Micro Four Thirds" },
      { value: "medium-format", label: "Medium Format" },
    ]
  },
```

Check how the SubmitForm renders `select` type fields to make sure this works with its existing rendering logic. If it only supports `type: "select"` for systemId (with special handling), you may need to add a coverage-specific rendering case. Read the form's rendering logic to determine the approach.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/submit/SubmitForm.tsx
git commit -m "Add coverage field to lens submit form"
```

---

### Task 10: Update lens detail page — show coverage

**Files:**
- Modify: `frontend/src/app/lenses/[slug]/page.tsx` (display coverage in the spec summary area)

- [ ] **Step 1: Display coverage badge on lens detail page**

Find where the system link/badge is displayed in the lens detail page. After it, add a coverage badge:

```typescript
{lens.coverage && (
  <Badge variant="outline">
    {lens.coverage === "aps-c" ? "APS-C"
      : lens.coverage === "full-frame" ? "Full Frame"
      : lens.coverage === "micro-four-thirds" ? "Micro Four Thirds"
      : lens.coverage === "medium-format" ? "Medium Format"
      : lens.coverage}
  </Badge>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/lenses/\[slug\]/page.tsx
git commit -m "Show coverage badge on lens detail page"
```

---

### Task 11: Verify — build and type check

- [ ] **Step 1: Run type check**

Run: `cd frontend && pnpm build`
Expected: Build succeeds with no type errors related to coverage.

- [ ] **Step 2: Fix any type errors**

If there are type errors (e.g., `coverage` not recognized on the lens type), check that the schema change in Task 2 was applied correctly and that `drizzle-kit generate` was run.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "Fix type errors from coverage field addition"
```
