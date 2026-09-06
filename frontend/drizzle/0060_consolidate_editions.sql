-- Eleven collections about one idea become one, and a collection whose name
-- promises a rule stops pretending to.
--
-- THE EDITIONS COLLECTIONS
--
-- Ten manufacturer collections plus anniversary-lenses hold 169 distinct
-- lenses between them, and four of the ten hold six or fewer. Canon holds
-- exactly one: across the whole 9,352-lens catalogue only one Canon lens
-- carries an edition marker, because Canon's collector editions were bodies,
-- which this site does not catalogue as lenses. Rollei holds one, Mamiya two.
-- Those are rows, not pages.
--
-- anniversary-lenses is the clearest case for folding. 111 lenses carry an
-- anniversary marker in their name; they split 23 in anniversary-lenses only,
-- 28 in a manufacturer collection only, 7 in both and 53 in neither. There is
-- no rule separating the first group from the second: the seven Leitz
-- "1913-1983" lenses sit in anniversary-lenses and not in the Leica M
-- collection, while the "150 Jahre Optik" lenses sit in Leica M and not in
-- anniversary-lenses. Same maker, same mount, same kind of object, opposite
-- filing. An anniversary is a reason for an edition, not a different kind of
-- thing.
--
-- Consolidating also fixes carl-zeiss-special-limited-editions, which was
-- never a Zeiss collection: its members were mostly Hasselblad V lenses, which
-- are Zeiss glass, so it duplicated its neighbour rather than describing
-- anything of its own.
--
-- Leica will dominate the merged page, at roughly half of it. That is honest:
-- Leica genuinely made most of them.
--
-- All eleven slugs redirect, so nothing 404s and no inbound link dies.
--
-- THE RULE THAT WAS NOT A RULE
--
-- compact-lightweight-fast-af-primes reads as a specification. Measured
-- against the rule its own membership encodes, an autofocus prime of 235g or
-- less at f/2.8 or faster, all 45 members pass and 129 non-members also
-- qualify: the Canon EF 50mm F/1.8 II, the Sony E 16mm and 20mm, the Fuji XF
-- 27mm. It covers 26% of its own name, and unlike the other collections the
-- gap is not catalogue growth, since most of the missing lenses were there all
-- along. The curator was picking favourites while the name implied a complete
-- list.
--
-- Completing it would make a 174-lens page that the /lenses filters already
-- do better. So the name changes to say what it is, and a description states
-- it outright. The slug is left alone: it is in the sitemap and there is no
-- reason to spend a redirect on a rename.
--
-- Idempotent: guarded on the source collections still existing, inserts use
-- ON CONFLICT DO NOTHING, and the rename matches on the old name.

-- 1. The destination. collections.name is unique, so this cannot double-run.
INSERT INTO collections (name, slug, description)
VALUES (
  'Special and limited editions',
  'special-limited-editions',
  'Lenses made in a deliberately capped run, or marked for an anniversary, a patron or a commemoration. Grouped here across every manufacturer rather than split into pages of one or two. Where a maker recorded the number built, that figure is on the lens.'
)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 2. Move every membership across.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT lc.lens_id, (SELECT id FROM collections WHERE slug = 'special-limited-editions')
FROM lens_collections lc
JOIN collections c ON c.id = lc.collection_id
WHERE c.slug LIKE '%special-limited-editions' AND c.slug <> 'special-limited-editions'
   OR c.slug = 'anniversary-lenses'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 3. Redirect all eleven old slugs before the rows go, so the cascade on
-- collection_redirects.collection_id cannot take them with it.
INSERT INTO collection_redirects (old_slug, collection_id)
SELECT c.slug, (SELECT id FROM collections WHERE slug = 'special-limited-editions')
FROM collections c
WHERE (c.slug LIKE '%special-limited-editions' AND c.slug <> 'special-limited-editions')
   OR c.slug = 'anniversary-lenses'
ON CONFLICT (old_slug) DO UPDATE SET collection_id = EXCLUDED.collection_id;
--> statement-breakpoint

-- 4. Any redirect that already pointed at one of the eleven now points at the
-- survivor instead of being destroyed with it.
UPDATE collection_redirects SET collection_id = (SELECT id FROM collections WHERE slug = 'special-limited-editions')
WHERE collection_id IN (
  SELECT id FROM collections
  WHERE (slug LIKE '%special-limited-editions' AND slug <> 'special-limited-editions')
     OR slug = 'anniversary-lenses'
);
--> statement-breakpoint

-- 5. Retire the eleven.
DELETE FROM collections
WHERE (slug LIKE '%special-limited-editions' AND slug <> 'special-limited-editions')
   OR slug = 'anniversary-lenses';
--> statement-breakpoint

-- 6. Say what the compact primes collection actually is.
UPDATE collections
SET name = 'Small fast autofocus primes worth carrying',
    description = 'A selection rather than a survey. Every lens here is an autofocus prime of 235g or less at f/2.8 or faster, but so are more than a hundred others, and this list does not try to hold them all. Use the lens filters for the complete set.'
WHERE slug = 'compact-lightweight-fast-af-primes'
  AND name = 'Compact, lightweight & fast AF primes';
