-- The camera counterpart of 0066. A fifth of the bodies found no listing on
-- the first asking-price sweep; the model-written query that rescued the
-- lenses is now asked for bodies too, and kept here once it has worked.

ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "ebay_search_query" text;
