-- Keep the listing title a recorded sale was judged from.
--
-- Without it a stored price cannot be re-checked. A sold eBay listing stops
-- being public, so source_url stops resolving and the evidence behind the
-- figure is gone for good. That is why the misattributed shift-lens sales
-- could only be inferred from the shape of the price distribution rather than
-- read: a Minolta MD Shift CA 35mm F/2.8 carries 15 sales from $31 to $761
-- and publishes $90-$120 for a lens worth several hundred, but which of those
-- rows are the plain non-shift listings is no longer answerable.
--
-- Nullable on purpose: the 141,304 existing rows have no title to backfill.

ALTER TABLE "price_history" ADD COLUMN IF NOT EXISTS "title" text;
