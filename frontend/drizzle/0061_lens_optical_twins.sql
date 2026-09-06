-- Turn same-optical-design from a collection into the relation it always was.
--
-- WHY IT COULD NOT STAY A COLLECTION
--
-- "Same optical design" is a claim about a PAIR: this lens is the same glass as
-- that one. A collection is a set, so it can say forty lenses have something in
-- common but never which pairs with which. The page listed forty lenses from
-- six brands with no stated relationship and an empty description, so a reader
-- could not tell what they were being shown. Completing it would have made that
-- worse, not better: a longer list with the same silence.
--
-- Every member turns out to be a modern autofocus OEM rebadge, one optical unit
-- sold under two or three names, and the pairings are recoverable. Joining the
-- members on focal range plus element and group counts, across brands, recovers
-- 14 pairs covering the members that carry element data. The evidence is
-- strong: the Konica Minolta, Sony and Tamron 18-200mm agree at 15 elements in
-- 13 groups and 405/401/398g, and the Pentax and Tamron 18-270mm at 16/13 and
-- 453/450g.
--
-- That rule is deliberately applied ONLY inside the collection. Run over the
-- whole catalogue it produces 656 cross-brand groups covering 6,018 lenses: it
-- is a good annotator of a curated list and a terrible generator of one. The
-- rest of the links below are the ones the audit verified by hand.
--
-- WHAT IS SEEDED
--
-- 1. The 14 recovered pairs, stored in both directions.
-- 2. Seven members whose twin is in the catalogue but was never a member. Three
--    of these match on weight exactly (305g, 465g, 460g), and one, the Pentax
--    FA 28-200mm, names its Tamron twin in its own description text: "known as
--    the Tamron AF 28-200mm F/3.8-5.6 LD Aspherical (IF) 171D". The pairing was
--    written down and never linked.
-- 3. Four Samsung D-Xenon lenses, which are rebadged Pentax units, matching
--    their Pentax originals on elements, groups and weight exactly.
--
-- NOT seeded: 2261 Pentax D FA* 70-200mm and 7599 Tamron SP 70-200mm A009,
-- which the collection asserted were the same lens. They are not: 19 elements
-- in 16 groups at 1755g against 23 in 17 at 1470g. That pairing was the
-- curator's claim and the data contradicts it.
--
-- The collection is deleted. Its URL redirects in next.config.ts, since
-- collection_redirects can only point at another collection and the
-- replacement is not one.
--
-- Idempotent: the table is created if absent, inserts use ON CONFLICT DO
-- NOTHING, and the delete matches nothing once applied.

CREATE TABLE IF NOT EXISTS "lens_optical_twins" (
	"lens_id" integer NOT NULL,
	"twin_id" integer NOT NULL,
	"kind" text DEFAULT 'rebadge' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lens_optical_twins_lens_id_twin_id_pk" PRIMARY KEY("lens_id","twin_id")
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lens_optical_twins_lens_id_lenses_id_fk') THEN
    ALTER TABLE "lens_optical_twins" ADD CONSTRAINT "lens_optical_twins_lens_id_lenses_id_fk"
      FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lens_optical_twins_twin_id_lenses_id_fk') THEN
    ALTER TABLE "lens_optical_twins" ADD CONSTRAINT "lens_optical_twins_twin_id_lenses_id_fk"
      FOREIGN KEY ("twin_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_lens_optical_twins_twin" ON "lens_optical_twins" ("twin_id");
--> statement-breakpoint

-- 1. Recover the pairings the collection was asserting, both directions.
WITH members AS (
  SELECT l.* FROM lens_collections lc
  JOIN collections c ON c.id = lc.collection_id AND c.slug = 'same-optical-design'
  JOIN lenses l ON l.id = lc.lens_id AND l.merged_into_id IS NULL
),
pairs AS (
  SELECT a.id AS a_id, b.id AS b_id
  FROM members a
  JOIN members b
    ON a.id < b.id
   AND a.brand IS DISTINCT FROM b.brand
   AND a.focal_length_min IS NOT DISTINCT FROM b.focal_length_min
   AND a.focal_length_max IS NOT DISTINCT FROM b.focal_length_max
   AND a.lens_elements IS NOT NULL
   AND a.lens_elements = b.lens_elements
   AND a.lens_groups IS NOT DISTINCT FROM b.lens_groups
)
INSERT INTO lens_optical_twins (lens_id, twin_id, kind, note)
SELECT a_id, b_id, 'rebadge', 'Recovered from the same-optical-design collection: identical focal range, element and group counts across brands.' FROM pairs
UNION ALL
SELECT b_id, a_id, 'rebadge', 'Recovered from the same-optical-design collection: identical focal range, element and group counts across brands.' FROM pairs
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2 and 3. The links the audit verified by hand: members whose twin was never
-- a member, and the Samsung rebadges of Pentax units.
WITH v(a, b, kind, note) AS (VALUES
  (4255, 7621, 'oem',     'Nikon AF 14mm F/2.8D ED and Tamron SP AF 14mm F/2.8 69E: 14 elements in 12 groups, 670g and 675g.'),
  (2252, 7556, 'rebadge', 'Pentax D FA 15-30mm F/2.8 and Tamron SP 15-30mm A012: 18 elements in 13 groups.'),
  (2556, 7623, 'oem',     'Konica Minolta AF 17-35mm and Tamron SP AF 17-35mm A05: 14 elements in 11 groups, 430g and 440g.'),
  (2255, 7642, 'rebadge', 'Pentax D FA 24-70mm F/2.8 and Tamron SP 24-70mm A007: 17 elements in 12 groups.'),
  (6733, 7508, 'rebadge', 'Pentax FA 28-105mm and Tamron 179D: 15 elements in 12 groups, both 305g.'),
  (6736, 7513, 'rebadge', 'Pentax FA 28-200mm and Tamron 171D, named in the Pentax lens own description: 16 elements in 14 groups, both 465g.'),
  (7057, 7391, 'rebadge', 'Sony E 18-200mm OSS LE and Tamron 18-200mm Di III VC B011: 17 elements in 13 groups, both 460g.'),
  (20358, 6648, 'rebadge', 'Samsung D-Xenon 10-17mm is the Pentax DA 10-17mm fisheye: 10 elements in 8 groups, both 320g.'),
  (20359, 6650, 'rebadge', 'Samsung D-Xenon 12-24mm is the Pentax DA 12-24mm: 13 elements in 11 groups, both 430g.'),
  (20362, 6657, 'rebadge', 'Samsung D-Xenon 18-250mm is the Pentax DA 18-250mm: 16 elements in 13 groups, both 455g.'),
  (17967, 17908, 'rebadge', 'Samsung D-Xenon 100mm macro is the Pentax D FA 100mm macro: 9 elements in 8 groups, both 345g.')
)
INSERT INTO lens_optical_twins (lens_id, twin_id, kind, note)
SELECT a, b, kind, note FROM v
WHERE EXISTS (SELECT 1 FROM lenses WHERE id = a AND merged_into_id IS NULL)
  AND EXISTS (SELECT 1 FROM lenses WHERE id = b AND merged_into_id IS NULL)
UNION ALL
SELECT b, a, kind, note FROM v
WHERE EXISTS (SELECT 1 FROM lenses WHERE id = a AND merged_into_id IS NULL)
  AND EXISTS (SELECT 1 FROM lenses WHERE id = b AND merged_into_id IS NULL)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 4. The collection has served its purpose.
DELETE FROM collections WHERE slug = 'same-optical-design';
