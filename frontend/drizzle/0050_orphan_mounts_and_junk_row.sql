-- Give the small orphaned mounts their bodies, and delete a row that was
-- never a camera.
--
-- THE JUNK ROW
--
-- Camera 1484 is named "Cameras", its slug is "cameras" and its url is
-- https://lens-db.com/cameras/ : the index page of the old site, scraped as
-- though it were a product. It has no year, no format and a stock photograph
-- of a shelf of DSLRs.
--
-- It was not harmless. The eBay pipeline treated it as a real camera and
-- recorded 92 price_history rows and one price_estimates row against it, so a
-- non-existent camera has been accumulating market data and consuming request
-- quota. price_history and price_estimates address entities polymorphically
-- with no foreign key, so those rows do not cascade and are deleted here
-- explicitly, before the camera itself. Checked first and confirmed zero:
-- ratings, comparisons, revisions, field citations, KEH links and lens
-- compatibility rows.
--
-- This delete is intentional and not reversible. It removes exactly one
-- camera row, 92 price_history rows and 1 price_estimates row.
--
-- THE ORPHANED MOUNTS
--
-- Eleven systems hold lenses and no camera. Researching each against
-- camera-wiki splits them cleanly in two.
--
-- Six are reflex housings, which are accessories bolted onto a rangefinder
-- to give it ground-glass focusing. They have no body of their own and are
-- correct exactly as they are: Leica Visoflex, Nikon reflex housing, Canon
-- Mirror Box and Mirror Box 2, Carl Zeiss Jena Flektoskop and Flektometer,
-- Zeiss-Ikon Panflex, Kilfitt Kilarflex. Nothing is changed for them.
--
-- Four are real camera mounts, handled below. The fifth, "Canon special
-- bayonet", is the extra bayonet on the Canon 7 and 7s that exists solely for
-- the 50mm f/0.95. Those bodies are already here and already carry Leica
-- Screw Mount, which is their principal mount. cameras.system_id holds one
-- system, and lenses get several through lens_systems while cameras do not,
-- so attaching them here would silently take away the mount they actually
-- wear most. It is left without a body deliberately; recording a camera's
-- second mount needs a junction table this schema does not have yet.
--
-- SOURCING
--
-- camera-wiki throughout, recorded as each row's url. Two dates are shakier
-- than the rest and say so in field_citations rather than being presented as
-- firm: the Topcon IC-1 Auto, whose own page gives both 1973 and 1974, and
-- the Wink Mirror S, whose 1963 appears only in a category listing and not in
-- the article prose. The Unirex EE has no year in any source found, so its
-- year is null and its slug carries no year, following Yashica T4 Super and
-- the other undated bodies already here.
--
-- Idempotent: the delete matches nothing once applied, the relinks are
-- guarded on system_id IS NULL, and the inserts use ON CONFLICT (slug), which
-- migration 0049 made available by creating the unique index cameras.slug was
-- always declared to have.

-- 1. Remove the price data attached to the junk row, then the row itself.
DELETE FROM price_history
WHERE entity_type = 'camera'
  AND entity_id = (SELECT id FROM cameras WHERE slug = 'cameras' AND url = 'https://lens-db.com/cameras/');
--> statement-breakpoint

DELETE FROM price_estimates
WHERE entity_type = 'camera'
  AND entity_id = (SELECT id FROM cameras WHERE slug = 'cameras' AND url = 'https://lens-db.com/cameras/');
--> statement-breakpoint

DELETE FROM cameras
WHERE slug = 'cameras' AND url = 'https://lens-db.com/cameras/';
--> statement-breakpoint

-- 2. Wrayflex and Start are already here with no system at all, while the
-- systems holding their lenses have sat empty. This is a relink, not an
-- import: 4 Wray lenses and 1 Helios-44 in the native Start mount become
-- reachable from a body.
UPDATE cameras
SET system_id = (SELECT id FROM systems WHERE slug = 'wrayflex')
WHERE slug IN ('wrayflex-i-1950', 'wrayflex-ia-1953', 'wrayflex-ii-1959')
  AND system_id IS NULL;
--> statement-breakpoint

UPDATE cameras
SET system_id = (SELECT id FROM systems WHERE slug = 'start')
WHERE slug = 'start-1957'
  AND system_id IS NULL;
--> statement-breakpoint

-- 3. The Topcon UV bodies. This is Topcon's leaf-shutter reflex line, whose
-- lenses carry no aperture ring because the aperture lives on the body. It is
-- a different mount from the "Topcon" system already here, which holds the
-- Exakta-mount RE line.
INSERT INTO cameras (name, slug, system_id, sensor_size, year_introduced, url, specs)
VALUES
  (
    'Topcon Wink Mirror S', 'topcon-wink-mirror-s-1963',
    (SELECT id FROM systems WHERE slug = 'topcon-uv'),
    '35mm full frame', 1963, 'https://camera-wiki.org/wiki/Topcon_Wink_Mirror_S',
    '{"Source": "https://camera-wiki.org/wiki/Topcon_Wink_Mirror_S", "Film type": "135 cartridge-loaded film", "Notes": "Sold in Germany as the Porst Reflex S. Not to be confused with the fixed-lens Topcon Wink and Wink E."}'::jsonb
  ),
  (
    'Topcon Uni', 'topcon-uni-1964',
    (SELECT id FROM systems WHERE slug = 'topcon-uv'),
    '35mm full frame', 1964, 'https://camera-wiki.org/wiki/Topcon_Uni',
    '{"Source": "https://camera-wiki.org/wiki/Topcon_Uni", "Film type": "135 cartridge-loaded film", "Notes": "Rebadged by Beseler as the Topcon Auto 100 and by Hanimex as the Topcon RE Auto; those are the same camera, not separate models."}'::jsonb
  ),
  (
    'Topcon Unirex', 'topcon-unirex-1969',
    (SELECT id FROM systems WHERE slug = 'topcon-uv'),
    '35mm full frame', 1969, 'https://camera-wiki.org/wiki/Topcon_Unirex',
    '{"Source": "https://camera-wiki.org/wiki/Topcon_Unirex", "Film type": "135 cartridge-loaded film", "Notes": "Produced 1969 to 1973."}'::jsonb
  ),
  (
    'Topcon Unirex EE', 'topcon-unirex-ee',
    (SELECT id FROM systems WHERE slug = 'topcon-uv'),
    '35mm full frame', NULL, 'https://camera-wiki.org/wiki/Topcon_Unirex',
    '{"Source": "https://camera-wiki.org/wiki/Topcon_Unirex", "Film type": "135 cartridge-loaded film", "Notes": "A variant of the Unirex with no page of its own. No source consulted gives its year, so it is recorded undated rather than guessed."}'::jsonb
  ),
  (
    'Topcon IC-1 Auto', 'topcon-ic-1-auto-1973',
    (SELECT id FROM systems WHERE slug = 'topcon-uv'),
    '35mm full frame', 1973, 'https://camera-wiki.org/wiki/Topcon_IC-1_Auto',
    '{"Source": "https://camera-wiki.org/wiki/Topcon_IC-1_Auto", "Film type": "135 cartridge-loaded film", "Notes": "camera-wiki gives 1973 to 1978 for the model but 1974 to 1976 for the first variant; the earlier date is used here."}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 4. The Voigtlander Prominent, a 35mm rangefinder with a bayonet unique to
-- it. Named without the umlaut to match the Voigtlander bodies already here.
-- Unrelated to the 6x9 rollfilm folder of the same name, which has a fixed
-- lens and must never be attached to this mount.
INSERT INTO cameras (name, slug, system_id, sensor_size, year_introduced, url, specs)
VALUES
  (
    'Voigtlander Prominent', 'voigtlander-prominent-1950',
    (SELECT id FROM systems WHERE slug = 'voigtlander-prominent'),
    '35mm full frame', 1950, 'https://camera-wiki.org/wiki/Prominent_(35mm)',
    '{"Source": "https://camera-wiki.org/wiki/Prominent_(35mm)", "Film type": "135 cartridge-loaded film", "Notes": "Produced 1950 to 1956, gaining a lever wind in 1956."}'::jsonb
  ),
  (
    'Voigtlander Prominent II', 'voigtlander-prominent-ii-1958',
    (SELECT id FROM systems WHERE slug = 'voigtlander-prominent'),
    '35mm full frame', 1958, 'https://camera-wiki.org/wiki/Prominent_(35mm)',
    '{"Source": "https://camera-wiki.org/wiki/Prominent_(35mm)", "Film type": "135 cartridge-loaded film", "Notes": "The line was withdrawn in 1960."}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 5. Say plainly where a date is softer than the rest, so the next person does
-- not have to rediscover it.
INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
SELECT 'camera', c.id, 'yearIntroduced', 'camera-wiki', v.source_url, v.note
FROM (VALUES
  (
    'topcon-ic-1-auto-1973',
    'https://camera-wiki.org/wiki/Topcon_IC-1_Auto',
    'The page gives 1973 to 1978 for the model and 1974 to 1976 for the first variant. 1973 is taken as the introduction; the conflict is unresolved.'
  ),
  (
    'topcon-wink-mirror-s-1963',
    'https://camera-wiki.org/wiki/Topcon_Wink_Mirror_S',
    '1963 appears only in a camera-wiki category listing, not in the article prose, so it is weaker than the other dates here.'
  )
) AS v(slug, source_url, note)
JOIN cameras c ON c.slug = v.slug
ON CONFLICT (entity_type, entity_id, field) DO NOTHING;
