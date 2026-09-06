-- Make collections.name unique, as lens_series.name has always been.
--
-- That missing constraint is the reason this whole clean-up was needed. The
-- import landed six collections under three display names, and because the
-- index sorts by name they rendered as identical adjacent cards: two "Fisheye
-- lenses", two "Macro 1:1", two "Macro 1:2", distinguishable only by their
-- lens counts. lens_series took the same kind of import and has no duplicates,
-- because its name column is unique.
--
-- Ordering matters here. scripts/consolidate-collections.mjs must have run
-- first: it merges the nine duplicate pairs, which is what removes the three
-- collisions. This migration cannot create the constraint while they exist and
-- will fail loudly rather than quietly if it is applied too early, which is
-- the right failure.
--
-- Idempotent: the constraint is added only if it is absent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'collections'::regclass
      AND conname = 'collections_name_unique'
  ) THEN
    ALTER TABLE "collections" ADD CONSTRAINT "collections_name_unique" UNIQUE("name");
  END IF;
END $$;
