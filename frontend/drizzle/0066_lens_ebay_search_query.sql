-- The eBay Browse API requires every word of a query to appear in a listing
-- title, and catalogue lens names carry qualifiers ("[II]", "Gen. X", "FDn",
-- "| C") that sellers never write. Half the catalogue found no listing on the
-- first asking-price sweep for that reason alone. This holds the keywords a
-- model wrote for the lens, so the retry is paid for once per lens, not once
-- per sweep.

ALTER TABLE "lenses" ADD COLUMN IF NOT EXISTS "ebay_search_query" text;
