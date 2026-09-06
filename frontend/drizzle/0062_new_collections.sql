-- Nine collections the catalogue supports and did not have.
--
-- The imported set was built when this site held a fraction of the lenses it
-- holds now, so whole categories have no home. Teleconverters are the starkest:
-- 186 of them, and until now not one was in any collection at all, despite
-- being something people shop for by name ("what 1.4x fits my mount") rather
-- than browse.
--
-- Each of these is a rule over a field the database already holds, so the
-- membership can be rebuilt at any time and does not rot the way a hand list
-- does. That is deliberate: the audits found every inherited collection was
-- accurate and none had been added to since the import, so the failure mode to
-- design against is staleness, not error.
--
-- WHERE THE LINE IS DRAWN
--
-- A page reads as curation up to roughly 200 lenses and as a database dump
-- above about 350. Several tempting ideas fall the wrong side and are
-- deliberately absent: fast primes at f/1.4 and faster (935), weather-sealed
-- (867), medium-format-capable (819, which is what `systems` is for),
-- stabilised (426). Those belong as filter presets on /lenses.
--
-- Also absent: the six classic optical formulas (Sonnar, Planar, Distagon,
-- Tessar, Heliar, Biogon, 579 lenses between them). They look like the
-- strongest idea available and they are a trap: Biogon is 28 of 28 Carl Zeiss,
-- Heliar 52 of 52 Cosina. They are one brand's product lines, so building them
-- as collections would recreate exactly the mistake that was just undone by
-- moving product lines into lens_series.
--
-- ON DUPLICATES
--
-- The catalogue holds the same physical lens under two records in places, so a
-- few of these pages will show a lens twice until that is resolved. Every list
-- on the site already filters merged_into_id, so a later deduplication removes
-- those rows from these pages without anyone touching the collections again.
--
-- Idempotent: inserts use ON CONFLICT on the slug, and memberships use
-- ON CONFLICT DO NOTHING.

INSERT INTO collections (name, slug, description) VALUES
  ('Teleconverters', 'teleconverters',
   'Every teleconverter and extender in the database. They multiply the focal length of the lens in front of them and cost you light doing it, which is why they are shopped for by mount and magnification rather than browsed.'),
  ('Constant f/2.8 zooms', 'constant-f28-zooms',
   'Zooms that hold f/2.8 across the whole range, the professional standard since the 1980s. A third of these predate 2000, so this is a history as much as a shopping list.'),
  ('Before 1950', 'before-1950',
   'Lenses introduced before the modern SLR arrived, when the rangefinder and the view camera set the terms. The oldest here reach back to the 1920s.'),
  ('Superzooms', 'superzooms',
   'One lens that covers wide to long, usually eight times its shortest focal length or more. Every one of them trades optical quality for never changing lenses.'),
  ('Supertelephotos over 3kg', 'supertelephotos-over-3kg',
   'The lenses you carry with both hands and shoot on a monopod. Sports, wildlife and the moon.'),
  ('Beyond 1:1', 'beyond-1-1',
   'Lenses that magnify past life size on the sensor, which almost nothing does. They complete the ladder that runs through the 1:2 and 1:1 macro collections.'),
  ('1000mm and beyond', 'thousand-mm-and-beyond',
   'The extreme long end of the catalogue. Mostly mirror lenses, because refracting that far gets heavy fast, but not only.'),
  ('East German optics', 'east-german-optics',
   'Jena, Görlitz and Dresden between 1946 and 1990. Carl Zeiss Jena, Meyer-Optik and Pentacon built some of the best glass of the period under conditions that make its survival remarkable. The natural sibling to the Soviet collection.'),
  ('Chinese fast primes', 'chinese-fast-primes',
   'The lenses that made f/1.2 and faster affordable. Almost all of these are younger than 2015 and most are manual focus, which is the trade that pays for the aperture.')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- Teleconverters: a hard field, no judgement.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'teleconverters')
FROM lenses l WHERE l.merged_into_id IS NULL AND l.lens_type = 'Teleconverter'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Constant f/2.8 zooms. The tolerance is because aperture is a real column and
-- comparing it to the literal 2.8 silently matches nothing.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'constant-f28-zooms')
FROM lenses l
WHERE l.merged_into_id IS NULL
  AND l.focal_length_min IS DISTINCT FROM l.focal_length_max
  AND abs(l.aperture_min - 2.8) < 0.01 AND abs(l.aperture_max - 2.8) < 0.01
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'before-1950')
FROM lenses l WHERE l.merged_into_id IS NULL AND l.year_introduced < 1950
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'superzooms')
FROM lenses l WHERE l.merged_into_id IS NULL AND l.lens_type = 'Superzoom lens'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'supertelephotos-over-3kg')
FROM lenses l WHERE l.merged_into_id IS NULL AND l.weight_g >= 3000
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Beyond 1:1. Safe to run now only because migration 0058 corrected four zooms
-- whose reproduction ratio was stored inverted; before that, a Tamron 17-50mm
-- recorded at 4.6x would have landed here.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'beyond-1-1')
FROM lenses l WHERE l.merged_into_id IS NULL AND l.max_magnification::numeric > 1.01
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'thousand-mm-and-beyond')
FROM lenses l WHERE l.merged_into_id IS NULL AND l.focal_length_min >= 1000
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- East German optics. Carl Zeiss Jena rows carry brand 'Carl Zeiss', so this
-- cannot be done by brand alone, which is why nobody had done it. Bounded to
-- 1946-1990: earlier is the German Reich and a different state, later is the
-- revived Meyer-Optik brand and a different company.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'east-german-optics')
FROM lenses l
WHERE l.merged_into_id IS NULL
  AND l.year_introduced BETWEEN 1946 AND 1990
  AND (
    l.specs->>'Country of design' LIKE 'GDR%'
    OR l.brand IN ('Meyer-Optik Görlitz', 'Pentacon', 'Prakticar', 'Praktica', 'Ludwig')
    OR (l.brand = 'Carl Zeiss' AND l.name ~* 'jena')
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Chinese fast primes, f/1.2 and faster. Brand list rather than country,
-- because 'Country of design' is populated on a minority of rows.
INSERT INTO lens_collections (lens_id, collection_id)
SELECT l.id, (SELECT id FROM collections WHERE slug = 'chinese-fast-primes')
FROM lenses l
WHERE l.merged_into_id IS NULL
  AND l.aperture_min::numeric <= 1.2
  AND (
    l.specs->>'Country of design' LIKE 'PRC%'
    OR l.brand IN ('7Artisans', 'TTArtisan', 'Viltrox', 'Meike', 'Brightin Star', 'Yongnuo',
                   'Kipon', 'Thypoch', 'Venus', 'AstrHori', 'Pergear', 'Sirui', 'NiSi',
                   'Funleader', 'Zhongyi', 'SG-Image', 'Artra', 'Artra Lab', 'Rockstar',
                   'Light Lens Lab', 'KamLan', 'Mr. Ding', 'Kelda', 'Neewer', 'Monolens', 'Risespray')
  )
ON CONFLICT DO NOTHING;
