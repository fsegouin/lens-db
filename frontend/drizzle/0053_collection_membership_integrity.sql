-- Give lens_collections the two foreign keys it was always declared to have,
-- and clear the orphans that accumulated because it did not have them.
--
-- THE DRIFT
--
-- src/db/schema.ts has declared both sides of this junction table as
-- references with onDelete: "cascade" since the table was created. The
-- database has never had them. lens_collections carries exactly one
-- constraint, its composite primary key, so a deleted lens left its
-- membership rows behind and nothing objected.
--
-- The sibling table proves this is drift and not a decision:
-- lens_series_memberships has both foreign keys, both cascading, and has zero
-- orphans. lens_collections has 39.
--
-- THE ORPHANS
--
-- 39 rows point at a lens id that no longer exists. There are no rows
-- pointing at a missing collection. Distribution:
--
--   same-optical-design 8, tamron-adaptall-2 4, fisheye-lenses 3, macro2 3,
--   nifty-forties 3, nifty-fourties 3, carl-zeiss-special-limited-editions 2,
--   macro 2, pancake-lenses 2, sigma-global-vision 2, and one each in
--   fisheyes, macro-1-2, mirror-reflex-lenses, pentax-star-lenses,
--   shift-lenses, tamron-adaptall-2-lenses, triplets.
--
-- These were user-visible. The collections index counted raw membership rows
-- while the collection page inner-joined lenses, so every orphan was a card
-- overstating its own page by one: same-optical-design advertised 54 and
-- delivered 46. That count is now taken over joined lens rows on both
-- surfaces, so it no longer depends on this cleanup, but the rows are dead
-- either way and the foreign key stops them returning.
--
-- The delete is not reversible and removes exactly 39 rows, none of which
-- resolve to a lens.
--
-- THE THREE MIS-TYPED LENSES
--
-- Unrelated to the junction table, found while checking whether collection
-- memberships agree with the lenses table. Three lenses are recorded as
-- "Body cap lens", which is a real category here holding 49 rows, and none of
-- these three belongs in it:
--
--   1969 F-Rolleinar-MC 14mm F/3.5           -> Fisheye lens
--   3029 Leica TS-APO-Elmar-S 120mm F/5.6    -> Shift lens
--   5829 Schneider PC-Super-Angulon HFT 28mm -> Shift lens
--
-- The F- prefix on the Rolleinar is Rollei's fisheye marking, TS is Leica's
-- tilt/shift marking and PC is Schneider's perspective control marking. All
-- three already sit in the matching collection, which is how they surfaced.
--
-- Idempotent throughout: the delete matches nothing once applied, both
-- constraints are added only if absent, and the updates are guarded on the
-- wrong value still being present.

-- 1. Clear the orphans first. The foreign key in step 2 cannot be added while
-- they exist.
DELETE FROM lens_collections lc
WHERE NOT EXISTS (SELECT 1 FROM lenses l WHERE l.id = lc.lens_id);
--> statement-breakpoint

-- 2. Add the constraints the schema has always declared. Guarded so a re-run
-- is a no-op rather than a duplicate_object error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lens_collections'::regclass
      AND conname = 'lens_collections_lens_id_lenses_id_fk'
  ) THEN
    ALTER TABLE lens_collections
      ADD CONSTRAINT lens_collections_lens_id_lenses_id_fk
      FOREIGN KEY (lens_id) REFERENCES lenses(id) ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'lens_collections'::regclass
      AND conname = 'lens_collections_collection_id_collections_id_fk'
  ) THEN
    ALTER TABLE lens_collections
      ADD CONSTRAINT lens_collections_collection_id_collections_id_fk
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

-- 3. Correct the three lens types. Matched on id and the wrong value together,
-- so this cannot overwrite a later hand correction.
UPDATE lenses SET lens_type = 'Fisheye lens'
WHERE id = 1969 AND lens_type = 'Body cap lens';
--> statement-breakpoint

UPDATE lenses SET lens_type = 'Shift lens'
WHERE id IN (3029, 5829) AND lens_type = 'Body cap lens';
