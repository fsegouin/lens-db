-- Four data defects found while auditing what the collections actually contain.
-- None is about collections; all four silently corrupt any query that filters
-- on lens speed, magnification or type.
--
-- 1. APERTURE_MAX HOLDS THE MINIMUM APERTURE
--
-- For a prime, aperture_min and aperture_max are the same number: there is no
-- range to describe. 450 primes store the stopped-down value instead, so the
-- Sony 100mm F/2.8 Macro reads f/32 and the Nikon Z DX 24mm F/1.7 reads f/11.
-- 429 of the 450 come from the id >= 17000 import.
--
-- Zooms have the same defect in a harder shape, because a zoom's aperture_max
-- is legitimately different from its minimum. The real value is in the name, so
-- it is parsed from there: "F3.5-6.3" gives 6.3, and a single figure means a
-- constant-aperture zoom whose max equals its min. Only rows where the stored
-- value EXCEEDS what the name says are touched, which leaves genuinely slow
-- lenses alone: the Nikon 360-1200mm F/11 really is f/11 and is not a defect.
--
-- 2. REPRODUCTION RATIOS STORED INVERTED
--
-- Four zooms have 1:X written as X, so they read as extreme macro lenses and
-- would be swept into macro-1-1 by any rule over max_magnification:
--
--   17540 Tamron 17-50mm F4 Di III VXD      4.6  ->  0.217
--   20458 Sigma 18-300mm DC Macro           3.0  ->  0.333
--   20330 Nikon 1 Nikkor VR 10-30mm         2.7  ->  0.370
--   6204  Sigma 60-600mm DG DN              2.4  ->  0.417
--
-- 3. "BODY CAP LENS" IS A SPURIOUS TYPE
--
-- 42 lenses carry lens_type = 'Body cap lens' and not one of them is a body cap
-- lens. The set includes the Asahi Reflex-Takumar 6x7 1000mm F/8 at 6.4kg, the
-- Nikon AI-S 800mm F/8 and the Nikon AF-I 500mm F/4. The three genuine body cap
-- lenses in the catalogue (Olympus 15mm F/8, Olympus 9mm Fish-Eye, Pentax 07
-- Mount Shield) are all typed 'Prime lens', so the label has no true positives
-- at all and is cleared rather than re-pointed. Assigning each of the 42 its
-- real type is a backfill, not a repair, and is left for one.
--
-- 4. MEMBERSHIP ROWS POINTING AT MERGED-AWAY LENSES
--
-- 61 rows across 18 collections point at a lens that has been merged into
-- another. Every list in the app filters them out, so they are invisible, but
-- for 5 of them the merge target is NOT also a member, which means the page
-- silently lost a lens. Those 5 are re-pointed at the survivor before all 61
-- are deleted.
--
-- NOT FIXED, DELIBERATELY: 1387 Carl Zeiss N-Mirotar 210mm F/0.03. The value
-- looks impossible and was reported as a defect, but the lens name carries the
-- same figure and the description explains it: a night-vision lens with a
-- built-in image intensifier. The number is real.
--
-- Idempotent throughout: every update is guarded on the defect still being
-- present, so a re-run matches nothing.

-- 1a. Primes: a prime's maximum aperture cannot be smaller than its minimum.
UPDATE lenses SET aperture_max = aperture_min
WHERE merged_into_id IS NULL AND is_prime
  AND aperture_min IS NOT NULL AND aperture_max IS NOT NULL
  AND aperture_max::numeric > aperture_min::numeric;
--> statement-breakpoint

-- 1b. Zooms: take the long-end aperture from the name, and only where the
-- stored value is worse than the name allows.
WITH derived AS (
  SELECT id,
    CASE
      WHEN substring(name from '[Ff]/?[0-9]+(?:\.[0-9]+)?-([0-9]+(?:\.[0-9]+)?)') IS NOT NULL
        THEN substring(name from '[Ff]/?[0-9]+(?:\.[0-9]+)?-([0-9]+(?:\.[0-9]+)?)')::real
      WHEN name ~ '[Ff]/?[0-9]' OR name ~ '\mT[0-9]'
        THEN aperture_min
      ELSE NULL
    END AS real_max
  FROM lenses
  WHERE merged_into_id IS NULL AND is_zoom AND aperture_min IS NOT NULL
)
UPDATE lenses SET aperture_max = derived.real_max
FROM derived
WHERE lenses.id = derived.id
  AND derived.real_max IS NOT NULL
  AND lenses.aperture_max::numeric > derived.real_max::numeric + 0.05;
--> statement-breakpoint

-- 2. Invert the four ratios that were stored the wrong way up.
UPDATE lenses SET max_magnification = round((1.0 / max_magnification)::numeric, 3)::real
WHERE id IN (17540, 20458, 20330, 6204)
  AND max_magnification::numeric > 1.0;
--> statement-breakpoint

-- 3. Clear the spurious type. Guarded on the value so a later hand correction
-- is never overwritten.
UPDATE lenses SET lens_type = NULL
WHERE lens_type = 'Body cap lens'
  AND id NOT IN (
    SELECT id FROM lenses WHERE name ILIKE '%body cap%' OR name ILIKE '%mount shield%'
  );
--> statement-breakpoint

-- 4a. Where a merged-away lens is a member and its survivor is not, give the
-- survivor the membership before the dead row goes.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.merged_into_id, lc.collection_id
FROM lens_collections lc
JOIN lenses l ON l.id = lc.lens_id
WHERE l.merged_into_id IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 4b. Then drop every membership that points at a merged-away lens.
DELETE FROM lens_collections lc
USING lenses l
WHERE l.id = lc.lens_id AND l.merged_into_id IS NOT NULL;
