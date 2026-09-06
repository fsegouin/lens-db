-- Membership corrections from a four-agent audit of what the collections
-- actually contain, checked lens by lens against the catalogue.
--
-- The headline result was reassuring and worth recording: across 621
-- memberships in the eight optical collections, and all eight thematic ones,
-- exactly one lens was in a collection it does not belong in. The curation this
-- site inherited is accurate. What it is not is finished, and the additions are
-- deliberately NOT in this migration; see the note at the end.
--
-- 1. SOFT-FOCUS LOST A THIRD OF ITS OWN CURATION
--
-- The collection's stored description still lists 19 lenses. Only 12 are
-- members. All 7 missing ones are in the catalogue and are unambiguous
-- soft-focus designs, so they are put back.
--
-- 2. ONE LENS IN THE WRONG COLLECTION
--
-- 8344 Voigtlander Nokton 50mm F/1.5 is the 1953 Prominent-mount original, a
-- German lens from four decades before the Japanese rangefinder revival the
-- collection is about. The Cosina reissue is already a member separately as
-- 1878. This is the only genuinely wrong membership the audit found anywhere.
--
-- 3. THE EDITIONS COLLECTIONS FILED THE PLAIN LENS ALONGSIDE THE EDITION
--
-- These collections have an objective test that was never applied:
-- specs->>'Production type' records a unit count ("Small-batch production: 300
-- units") or an "(Anniversary edition)" tag. Not one 'Mass production' lens is
-- a member, which the original curator got right. But 35 members carry no
-- edition marker and no unit count, because the curator entered the ordinary
-- production lens beside the limited variant of it: the Canon EF 35-135mm is
-- there only because a "60 Million Units Edition" exists, and the plain Planar
-- 80mm appears in five mounts across two collections.
--
-- Three of the 35 are a different error: 17897, 17905 and 6679 are Pentax
-- "Limited" lenses, which is a product line and not a limited edition. That
-- line was in continuous production for two decades and already exists as
-- lens_series "Pentax Limited".
--
-- 2959 was on the audit's removal list and is NOT removed here. It is a
-- genuine anniversary edition, carrying "Small-batch production (Anniversary
-- edition)", but it is a Summilux-M filed in the Leica R collection. It moves
-- to the M collection rather than being dropped.
--
-- 4. MACRO-BELLOWS-LENSES HAS NO CONTENT OF ITS OWN
--
-- An earlier structural review kept this 3-member collection on the grounds
-- that it overlapped bellows-lenses by only 2, so it looked like a genuine
-- sub-collection. That reading was an artefact of duplicate lens rows. Members
-- 25 and 43 are in bellows-lenses already, and the third, 5138 Olympus OM
-- Zuiko Bellows Auto-Macro 135mm F/4.5, is the same physical lens as
-- bellows-lenses member 5123: same focal length, aperture, weight, element
-- count, mount and year. The overlap is 3 of 3.
--
-- Its stored description also advertises about 28 lenses across 17 systems that
-- its 3 members do not include, so the page has been broken as well as
-- redundant. It is deleted with a redirect to bellows-lenses, where all three
-- of its lenses already live.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- The audit found roughly 830 qualifying lenses missing across the optical
-- collections alone, and more in the thematic ones. None is added here. The
-- same audits established that the catalogue holds a large number of duplicate
-- lens rows, and that between a third and four fifths of every candidate list
-- is the same lens under a second record. Adding in bulk before those are
-- merged would put the same lens on a page two or three times. The additions
-- wait on the deduplication.
--
-- Idempotent: deletes match nothing once applied, inserts use ON CONFLICT DO
-- NOTHING, and the redirect upserts.

-- 1. Put back the seven soft-focus lenses the collection's own description
-- still lists.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT v.lens_id, c.id
FROM (VALUES (3391), (3622), (3623), (3669), (6715), (7597), (19776)) AS v(lens_id)
CROSS JOIN collections c
WHERE c.slug = 'soft-focus-lenses'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 2. The 1953 German Nokton is not part of the 1990s Japanese revival.
DELETE FROM lens_collections
WHERE lens_id = 8344
  AND collection_id = (SELECT id FROM collections WHERE slug = 'japanese-rangefinder-revival-of-1990s-2000s');
--> statement-breakpoint

-- 3a. Move the Summilux-M out of the Leica R collection and into the M one,
-- where a real anniversary edition belongs.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT 2959, id FROM collections WHERE slug = 'leica-m-special-limited-editions'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

DELETE FROM lens_collections
WHERE lens_id = 2959
  AND collection_id = (SELECT id FROM collections WHERE slug = 'leica-r-special-limited-editions');
--> statement-breakpoint

-- 3b. Remove the 35 ordinary production lenses. Pinned as (lens, collection)
-- pairs so a lens that legitimately belongs to another editions collection is
-- untouched: 1408, 1437, 1440, 1448, 1449 and 1451 each appear twice below
-- because they were filed in two collections at once.
DELETE FROM lens_collections lc
USING (VALUES
  (599,'canon-special-limited-editions'),
  (1408,'rollei-special-limited-editions'), (1412,'rollei-special-limited-editions'),
  (1408,'carl-zeiss-special-limited-editions'), (1437,'carl-zeiss-special-limited-editions'),
  (1440,'carl-zeiss-special-limited-editions'), (1448,'carl-zeiss-special-limited-editions'),
  (1449,'carl-zeiss-special-limited-editions'), (1451,'carl-zeiss-special-limited-editions'),
  (1437,'hasselblad-special-limited-editions'), (1440,'hasselblad-special-limited-editions'),
  (1448,'hasselblad-special-limited-editions'), (1449,'hasselblad-special-limited-editions'),
  (1451,'hasselblad-special-limited-editions'), (2238,'hasselblad-special-limited-editions'),
  (4427,'nikon-special-limited-editions'), (4527,'nikon-special-limited-editions'),
  (4579,'nikon-special-limited-editions'), (4795,'nikon-special-limited-editions'),
  (1814,'cosina-voigtlander-special-limited-editions'), (1838,'cosina-voigtlander-special-limited-editions'),
  (1862,'cosina-voigtlander-special-limited-editions'), (1873,'cosina-voigtlander-special-limited-editions'),
  (2250,'pentax-special-limited-editions'), (2257,'pentax-special-limited-editions'),
  (2261,'pentax-special-limited-editions'), (2264,'pentax-special-limited-editions'),
  (6521,'pentax-special-limited-editions'), (6634,'pentax-special-limited-editions'),
  (6682,'pentax-special-limited-editions'), (6686,'pentax-special-limited-editions'),
  (6739,'pentax-special-limited-editions'),
  (17897,'pentax-special-limited-editions'), (17905,'pentax-special-limited-editions'),
  (6679,'pentax-special-limited-editions')
) AS v(lens_id, coll_slug)
JOIN collections c ON c.slug = v.coll_slug
WHERE lc.lens_id = v.lens_id AND lc.collection_id = c.id;
--> statement-breakpoint

-- 4. Retire macro-bellows-lenses. The redirect is written before the delete so
-- the cascade on collection_redirects.collection_id cannot destroy it.
INSERT INTO collection_redirects (old_slug, collection_id)
SELECT 'macro-bellows-lenses', id FROM collections WHERE slug = 'bellows-lenses'
ON CONFLICT (old_slug) DO UPDATE SET collection_id = EXCLUDED.collection_id;
--> statement-breakpoint

DELETE FROM collections WHERE slug = 'macro-bellows-lenses';
