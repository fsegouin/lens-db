-- Seven Tamron lenses that are in the catalogue twice, blocking the collection
-- merges.
--
-- WHY THEY EXIST
--
-- The imported collections carry two naming conventions, and the two were
-- built against different rows for the same physical lens. One writes the
-- internal-focus marker as [IF] and omits the reproduction ratio, the other
-- writes (IF) and spells the ratio out as "Macro 1:1". Both rows have the same
-- year and the same Tamron model code, and where both record optics they agree
-- exactly: 14 elements and 610g for the F017, 14 and 920 for the B01, 10 and
-- 403 for the 72E. Their lens-db source URLs differ only by the same cosmetic
-- token. They are one lens each, scraped twice from two index pages.
--
-- Left alone until the collection merges land, each pair would list the same
-- lens twice on the merged page, with one row linking to a slug that no longer
-- resolves.
--
-- WHICH ROW SURVIVES
--
-- The richer record, then the one carrying more price history. That rule
-- decides every pair here without a coin toss:
--
--   keep 7613  drop 7611   SP 90mm F/2.8 Di Macro VC USD F017 (2016)
--   keep 7615  drop 7614   SP 90mm F/2.8 Macro 72B (1996)      [7614 has no optics]
--   keep 7631  drop 7630   SP AF 180mm F/3.5 Di LD B01 (2003)
--   keep 7657  drop 7658   SP AF 60mm F/2 Di II LD G005 (2009)
--   keep 7669  drop 7667   SP AF 90mm F/2.8 Di Macro 272E (2004) [7667 has no optics]
--   keep 7672  drop 7675   SP AF 90mm F/2.8 Macro 72E (1996)
--   keep 7566  drop 7565   SP 180mm F/2.5 LD 63B 35th Anniversary (1988) [7565 has no optics]
--
-- Every dropped row holds one or two collection memberships its survivor does
-- not, so those are moved first. Setting merged_into_id alone would filter
-- them out of every list and silently lose them.
--
-- Neither ratings nor mounts sit only on a dropped row, so nothing else moves.
-- Price history stays where it is: it is per-listing, unique on
-- (entity_type, entity_id, source_url), and moving it would either collide or
-- double-count a market. It becomes inert, which is what the existing
-- lens merge in /api/admin/duplicates already does.
--
-- TWO PAIRS DELIBERATELY NOT MERGED
--
-- Nikon GN Auto Nikkor 45mm F/2.8 #4640 (1968) and #4642 (1973): the source
-- gave these separate URLs, one with a -c- segment, and Nikon's C marks
-- multicoating. A five-year gap and a coating change is a real variant, not a
-- duplicate.
--
-- Tamron 70-350mm F/4.5 CZ-735 #7474 and #7475 (both 1976, both 15 elements,
-- both 1820g): identical on every measured field, but "Multi C." is Tamron's
-- own coating designation and could mark a genuine variant the way the Nikon
-- C does. Left for a human to decide rather than guessed at.
--
-- Idempotent: the membership moves use ON CONFLICT DO NOTHING and the
-- merged_into_id updates are guarded on the column still being null.

-- 1. Move memberships that exist only on the row about to be retired.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT v.keep_id, lc.collection_id
FROM (VALUES (7613, 7611), (7615, 7614), (7631, 7630), (7657, 7658),
             (7669, 7667), (7672, 7675), (7566, 7565)) AS v(keep_id, dupe_id)
JOIN lens_collections lc ON lc.lens_id = v.dupe_id
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2. Retire the duplicates. Guarded on merged_into_id IS NULL so a re-run
-- cannot re-point a row that has since been merged somewhere else by hand.
UPDATE lenses SET merged_into_id = v.keep_id
FROM (VALUES (7613, 7611), (7615, 7614), (7631, 7630), (7657, 7658),
             (7669, 7667), (7672, 7675), (7566, 7565)) AS v(keep_id, dupe_id)
WHERE lenses.id = v.dupe_id AND lenses.merged_into_id IS NULL;
