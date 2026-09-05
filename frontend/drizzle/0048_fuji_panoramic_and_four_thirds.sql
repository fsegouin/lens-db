-- Fill the medium format holes the lens-db.com import left, and stop the
-- Four Thirds DSLRs claiming a mount they never had.
--
-- WHY THESE ROWS
--
-- Every camera in the database arrived in one burst in March 2026 from the
-- archived lens-db.com pages, and nothing has added a body since except the
-- 23 compacts of 3 September. That archive was organised around lens mounts,
-- so a family only earned camera pages when its lenses were being catalogued.
-- Two consequences are visible in our own data and are what this migration
-- repairs.
--
-- 1. The "Fujica G690" system carries 7 Fujinon lenses and zero cameras. We
--    publish the lenses of Fuji's interchangeable 6x9 rangefinders without a
--    single body they fit. camera-wiki lists exactly the same 7 lenses for the
--    mount, so the four bodies below are the whole of what was missing.
--
-- 2. The 617 panoramics were never there at all. The GX617 is not a modelling
--    problem: it takes four interchangeable Fujinon modules, so it is the same
--    shape as the Mamiya 7 and the Hasselblad XPan, both of which already sit
--    in their own small systems here.
--
-- The GW690 fixed-lens bodies come along because they are the rest of the same
-- family and the archive kept only the two 6x7 ones, GW670II and GW670III.
-- They reuse the existing "Fuji EBC Fujinon 90mm F/3.5" row exactly as those
-- two already share it, rather than minting duplicate lenses.
--
-- THE FOUR THIRDS BUG
--
-- All 18 Four Thirds DSLRs sit on the Micro Four Thirds system, so the site
-- tells a reader that an Olympus E-1 of 2003 accepts Micro Four Thirds lenses,
-- and leaves the 21 Four Thirds lenses showing no body at all. Four Thirds and
-- Micro Four Thirds are different mounts with different flange distances; only
-- the image circle is shared, which is why they correctly keep one coverage
-- value. This moves the bodies to the mount they actually have.
--
-- SOURCING
--
-- Bodies and lens line-ups come from camera-wiki, recorded as each row's url,
-- which is this project's default citation. The four GX617 lens designations
-- are not on camera-wiki, which lists focal lengths only, so they are cited
-- individually in field_citations against KEH, which sells them by name. The
-- 180mm designation is confirmed by our own KEH mirror in keh_products.
--
-- Idempotency: cameras.slug is declared .unique() in schema.ts but has no
-- unique index in the database, unlike lenses and systems, so the camera
-- inserts below guard with NOT EXISTS rather than ON CONFLICT. That missing
-- index is a real schema drift and wants its own generated migration; it is
-- deliberately not created here, because this is a data-only migration and a
-- schema change made outside drizzle-kit generate would drift the snapshot.
--
-- Reversible: every insert is keyed on a slug that did not previously exist
-- and every update is guarded, so the file is a no-op once applied and can be
-- rerun safely.

-- 1. Four Thirds DSLRs move off Micro Four Thirds onto Four Thirds.
UPDATE cameras
SET system_id = (SELECT id FROM systems WHERE slug = 'four-thirds')
WHERE slug IN (
  'olympus-e-1-2003',
  'olympus-e-3-2007',
  'olympus-e-5-2010',
  'olympus-e-30-2008',
  'olympus-e-300-evolt-e-300-2004',
  'olympus-e-330-evolt-e-330-2006',
  'olympus-e-400-evolt-e-400-2006',
  'olympus-e-410-evolt-e-410-2007',
  'olympus-e-420-evolt-e-420-2008',
  'olympus-e-450-evolt-e-450-2009',
  'olympus-e-500-evolt-e-500-2005',
  'olympus-e-510-evolt-e-510-2007',
  'olympus-e-520-evolt-e-520-2008',
  'olympus-e-600-evolt-e-600-2009',
  'olympus-e-620-evolt-e-620-2009',
  'panasonic-lumix-dmc-l1-2006',
  'panasonic-lumix-dmc-l10-2007',
  'leica-digilux-3-2006'
)
AND system_id = (SELECT id FROM systems WHERE slug = 'micro-four-thirds');
--> statement-breakpoint

-- 2. The GX617 mount: four modules, sold only for this camera.
INSERT INTO systems (name, slug, manufacturer, description)
VALUES (
  'Fuji GX617',
  'fuji-gx617',
  'Fuji',
  'The mount of the Fuji GX617 Professional, a 6x17cm panoramic camera of 1993. Four Fujinon modules were made for it, each one a lens in its own Copal 0 leaf shutter carried on a cone, with a matched viewfinder mask and centre filter. Nothing else takes them, and the camera takes nothing else.'
)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 3. The four GX617 modules, plus the two fixed lenses the new bodies need.
INSERT INTO lenses (
  name, slug, brand, system_id, lens_type, focal_length_min, focal_length_max,
  aperture_min, filter_size_mm, year_introduced, is_prime, url
)
VALUES
  (
    'Fuji EBC Fujinon SWD 90mm F/5.6 (GX617)',
    'fuji-ebc-fujinon-swd-90mm-f-5-6-gx617',
    'Fuji',
    (SELECT id FROM systems WHERE slug = 'fuji-gx617'),
    'Prime lens', 90, 90, 5.6, 77, 1993, true,
    'https://camera-wiki.org/wiki/Fuji_GX617'
  ),
  (
    'Fuji EBC Fujinon SW 105mm F/8 (GX617)',
    'fuji-ebc-fujinon-sw-105mm-f-8-gx617',
    'Fuji',
    (SELECT id FROM systems WHERE slug = 'fuji-gx617'),
    'Prime lens', 105, 105, 8, 77, 1993, true,
    'https://camera-wiki.org/wiki/Fuji_GX617'
  ),
  (
    'Fuji EBC Fujinon W 180mm F/6.7 (GX617)',
    'fuji-ebc-fujinon-w-180mm-f-6-7-gx617',
    'Fuji',
    (SELECT id FROM systems WHERE slug = 'fuji-gx617'),
    'Prime lens', 180, 180, 6.7, 77, 1993, true,
    'https://camera-wiki.org/wiki/Fuji_GX617'
  ),
  (
    'Fuji EBC Fujinon T 300mm F/8 (GX617)',
    'fuji-ebc-fujinon-t-300mm-f-8-gx617',
    'Fuji',
    (SELECT id FROM systems WHERE slug = 'fuji-gx617'),
    'Prime lens', 300, 300, 8, 67, 1993, true,
    'https://camera-wiki.org/wiki/Fuji_GX617'
  ),
  -- Fixed to the G617 body, so no system, exactly as the other built-in
  -- lenses are recorded. It is not the GX617 module of the same designation:
  -- that one comes off, this one does not.
  (
    'Fuji EBC Fujinon SW 105mm F/8 (G617)',
    'fuji-ebc-fujinon-sw-105mm-f-8-g617',
    'Fuji',
    NULL,
    'Prime lens', 105, 105, 8, 77, 1983, true,
    'https://camera-wiki.org/wiki/Fujica_Panorama_G617'
  ),
  -- Shared by every GSW body below, as the 90mm F/3.5 row is already shared
  -- by GW670II and GW670III.
  (
    'Fuji EBC Fujinon SW 65mm F/5.6',
    'fuji-ebc-fujinon-sw-65mm-f-5-6',
    'Fuji',
    NULL,
    'Prime lens', 65, 65, 5.6, NULL, 1980, true,
    'https://camera-wiki.org/wiki/Fujica_GW690'
  )
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- 4. Every new body, in one guarded insert. system_slug is null for the
-- fixed-lens bodies, which are joined to their lens in step 5.
INSERT INTO cameras (name, slug, system_id, sensor_size, year_introduced, url, specs)
SELECT
  v.name,
  v.slug,
  (SELECT id FROM systems WHERE slug = v.system_slug),
  v.sensor_size,
  v.year_introduced::integer,
  v.url,
  v.specs::jsonb
FROM (VALUES
  -- The 617 panoramics.
  (
    'Fuji GX617 Professional', 'fuji-gx617-professional-1993', 'fuji-gx617',
    'Medium format 6x17', 1993, 'https://camera-wiki.org/wiki/Fuji_GX617',
    '{"Source": "https://camera-wiki.org/wiki/Fuji_GX617", "Film type": "120 roll film; 220 roll film", "Maximum format": "Medium format 6x17", "Exposures per roll": "4 on 120; 8 on 220"}'
  ),
  (
    'Fujica Panorama G617 Professional', 'fujica-panorama-g617-professional-1983', NULL,
    'Medium format 6x17', 1983, 'https://camera-wiki.org/wiki/Fujica_Panorama_G617',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_Panorama_G617", "Film type": "120 roll film; 220 roll film", "Filters": "77mm", "Maximum format": "Medium format 6x17", "Notes": "Renamed Fuji Panorama G617 in 1985; replaced by the GX617 in 1993."}'
  ),
  -- The interchangeable-lens 6x9 bodies the Fujica G690 system has been
  -- missing since the import.
  (
    'Fujica G690', 'fujica-g690-1968', 'fujica-g690',
    'Medium format 6x9', 1968, 'https://camera-wiki.org/wiki/Fujica_G690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_G690", "Film type": "120 roll film; 220 roll film", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fujica G690BL', 'fujica-g690bl-1969', 'fujica-g690',
    'Medium format 6x9', 1969, 'https://camera-wiki.org/wiki/Fujica_G690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_G690", "Film type": "120 roll film; 220 roll film", "Maximum format": "Medium format 6x9", "Notes": "Adds a lock for lens removal."}'
  ),
  (
    'Fujica GL690 Professional', 'fujica-gl690-professional-1974', 'fujica-g690',
    'Medium format 6x9', 1974, 'https://camera-wiki.org/wiki/Fujica_G690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_G690", "Film type": "120 roll film; 220 roll film", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fujica GM670 Professional', 'fujica-gm670-professional-1974', 'fujica-g690',
    'Medium format 6x7', 1974, 'https://camera-wiki.org/wiki/Fujica_G690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_G690", "Film type": "120 roll film; 220 roll film", "Maximum format": "Medium format 6x7"}'
  ),
  -- The fixed-lens successors. The archive kept only the two 6x7 bodies.
  (
    'Fujica GW690 Professional', 'fujica-gw690-professional-1978', NULL,
    'Medium format 6x9', 1978, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "November 1978", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fujica GSW690 Professional', 'fujica-gsw690-professional-1980', NULL,
    'Medium format 6x9', 1980, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "March 1980", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fuji GW690II Professional', 'fuji-gw690ii-professional-1985', NULL,
    'Medium format 6x9', 1985, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "June 1985", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fuji GSW690II Professional', 'fuji-gsw690ii-professional-1985', NULL,
    'Medium format 6x9', 1985, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "June 1985", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fuji GW690III Professional', 'fuji-gw690iii-professional-1992', NULL,
    'Medium format 6x9', 1992, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "February 1992", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fuji GSW690III Professional', 'fuji-gsw690iii-professional-1992', NULL,
    'Medium format 6x9', 1992, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "February 1992", "Maximum format": "Medium format 6x9"}'
  ),
  (
    'Fuji GW680III Professional', 'fuji-gw680iii-professional-1992', NULL,
    'Medium format 6x8', 1992, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "March 1992", "Maximum format": "Medium format 6x8"}'
  ),
  (
    'Fuji GSW680III Professional', 'fuji-gsw680iii-professional-1992', NULL,
    'Medium format 6x8', 1992, 'https://camera-wiki.org/wiki/Fujica_GW690',
    '{"Source": "https://camera-wiki.org/wiki/Fujica_GW690", "Film type": "120 roll film; 220 roll film", "Announced": "November 1992", "Maximum format": "Medium format 6x8"}'
  )
) AS v(name, slug, system_slug, sensor_size, year_introduced, url, specs)
WHERE NOT EXISTS (SELECT 1 FROM cameras c WHERE c.slug = v.slug);
--> statement-breakpoint

-- 5. Point every fixed-lens body at the lens fitted to it.
UPDATE cameras c
SET built_in_lens_id = l.id
FROM lenses l
WHERE c.built_in_lens_id IS NULL
  AND (
    (c.slug = 'fujica-panorama-g617-professional-1983' AND l.slug = 'fuji-ebc-fujinon-sw-105mm-f-8-g617')
    OR (c.slug IN (
          'fujica-gw690-professional-1978',
          'fuji-gw690ii-professional-1985',
          'fuji-gw690iii-professional-1992',
          'fuji-gw680iii-professional-1992'
        ) AND l.slug = 'fuji-ebc-fujinon-90mm-f-3-5')
    OR (c.slug IN (
          'fujica-gsw690-professional-1980',
          'fuji-gsw690ii-professional-1985',
          'fuji-gsw690iii-professional-1992',
          'fuji-gsw680iii-professional-1992'
        ) AND l.slug = 'fuji-ebc-fujinon-sw-65mm-f-5-6')
  );
--> statement-breakpoint

-- 6. camera-wiki gives the GX617 focal lengths without designations, so the
-- names above are sourced separately and say so.
INSERT INTO field_citations (entity_type, entity_id, field, source_name, source_url, note)
SELECT 'lens', l.id, 'name', 'KEH', v.source_url,
       'camera-wiki lists the four GX617 focal lengths without designations; KEH sells them by name.'
FROM (VALUES
  ('fuji-ebc-fujinon-swd-90mm-f-5-6-gx617', 'https://www.keh.com/shop/fuji-gx617-90mm-f-5-6-ebc-lens-77-675061.html'),
  ('fuji-ebc-fujinon-sw-105mm-f-8-gx617', 'https://www.keh.com/shop/fuji-gx617-105mm-f-8-ebc-lens-77-675062.html'),
  ('fuji-ebc-fujinon-w-180mm-f-6-7-gx617', 'https://www.keh.com/shop/fuji-gx617-180mm-f-6-7-ebc-lens-77-675065.html'),
  ('fuji-ebc-fujinon-t-300mm-f-8-gx617', 'https://www.keh.com/shop/fuji-gx617-300mm-f-8-ebc-lens-67-675063.html')
) AS v(slug, source_url)
JOIN lenses l ON l.slug = v.slug
ON CONFLICT (entity_type, entity_id, field) DO NOTHING;
