-- The twin-lens reflexes, which the archive had none of.
--
-- Before this migration the database held not one TLR. The lens-db.com import
-- was organised around lens mounts, and a TLR has no mount to catalogue: its
-- lens is built in, so the whole class fell through. The only exception is the
-- Mamiya C, whose lenses do come off, and it was missing too.
--
-- 118 bodies, 34 lenses and one system, from camera-wiki. Families: Rolleiflex
-- TLR and Rolleicord, Mamiya C, Yashica, Minolta Autocord, Ricoh Dia and
-- Diacord, Lubitel, and the Shanghai and Seagull line.
--
-- THE MAMIYA C SYSTEM
--
-- Its lens pairs are interchangeable, so it gets a system exactly as the Fuji
-- GX617 did in 0048. Mamiya never named the fitting: it is a shuttered lens
-- board held by a clamp, not a bayonet, so no manufacturer designation exists
-- to record and none is invented. The eight lenses are the Mamiya C page's
-- line-up with its cm and mm duplicates collapsed, since "13.5cm f/4.5" and
-- "135mm f/4.5" are the same optic engraved two ways.
--
-- WHERE A BODY HAS NO BUILT-IN LENS
--
-- 55 of the 118 bodies point at the lens fitted to them. The rest are bodies
-- camera-wiki records as sold with a choice, most of the Rolleiflex letter
-- series being Planar or Xenotar, and a few where it names no lens at all.
-- Asserting one of two would be inventing a fact about a specific camera, so
-- those carry no built-in lens and list what was available in specs under
-- "Lens options". A later editor can split them into per-lens rows, which is
-- how the archive recorded the Hasselblad SWC variants.
--
-- Lens rows are shared by every body that carries them, as the Fuji 90mm
-- F/3.5 row is already shared by GW670II and GW670III.
--
-- DATES
--
-- Recorded only where a source gives one. Seagull is the weak spot: camera-wiki
-- dates the 4A in prose to the late 1960s while tagging it 1964, gives the
-- 4A-103 and 4B no year at all, and category tags are not assertions, so those
-- three go in undated rather than invented. Several Yashica years come from
-- Paul Sokk's dating table rather than camera-wiki, and the Yashica-A and
-- Yashica-C are genuinely disputed between period advertising and McKeown;
-- all of that is written into specs.Notes rather than smoothed over. Where
-- camera-wiki contradicts itself, as on the Original Rolleiflex and the
-- 2.8 A, the note says so and names the year chosen.
--
-- Idempotent: every insert is ON CONFLICT (slug) DO NOTHING and the built-in
-- lens links are guarded on IS NULL. Verified before writing that none of the
-- 118 camera slugs or 34 lens slugs already exists, and that none collides
-- inside the batch.

INSERT INTO systems (name, slug, manufacturer, description) VALUES (
  'Mamiya TLR',
  'mamiya-tlr',
  'Mamiya',
  'The interchangeable lens fitting of the Mamiya C twin-lens reflexes, the only TLR system whose lenses come off. A pair of matched taking and viewing lenses sits on one board, each pair carrying its own leaf shutter and iris, held to the body by a clamp rather than a bayonet. Mamiya never gave the fitting a name of its own.'
) ON CONFLICT (slug) DO NOTHING;

--> statement-breakpoint

INSERT INTO lenses (name, slug, brand, system_id, lens_type, focal_length_min, focal_length_max, aperture_min, year_introduced, is_prime, url) VALUES
  ('Carl Zeiss Tessar 75mm F/3.5', 'carl-zeiss-tessar-75mm-f-3-5', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex'),
  ('Carl Zeiss Tessar 75mm F/4.5', 'carl-zeiss-tessar-75mm-f-4-5', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Original_Rolleiflex_6×6'),
  ('Carl Zeiss Tessar 75mm F/3.8', 'carl-zeiss-tessar-75mm-f-3-8', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 3.8, NULL, true, 'https://camera-wiki.org/wiki/Original_Rolleiflex_6×6'),
  ('Carl Zeiss Planar 75mm F/3.5', 'carl-zeiss-planar-75mm-f-3-5', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series'),
  ('Carl Zeiss Planar 80mm F/2.8', 'carl-zeiss-planar-80mm-f-2-8', 'Carl Zeiss', NULL, 'Prime lens', 80, 80, 2.8, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series'),
  ('Carl Zeiss Jena Biometar 80mm F/2.8', 'carl-zeiss-jena-biometar-80mm-f-2-8', 'Carl Zeiss', NULL, 'Prime lens', 80, 80, 2.8, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series'),
  ('Carl Zeiss Sonnar 135mm F/4', 'carl-zeiss-sonnar-135mm-f-4', 'Carl Zeiss', NULL, 'Prime lens', 135, 135, 4, NULL, true, 'https://camera-wiki.org/wiki/Tele_Rolleiflex'),
  ('Carl Zeiss Distagon 55mm F/4', 'carl-zeiss-distagon-55mm-f-4', 'Carl Zeiss', NULL, 'Prime lens', 55, 55, 4, NULL, true, 'https://camera-wiki.org/wiki/Wide-Angle_Rolleiflex'),
  ('Schneider-Kreuznach Xenar 75mm F/3.5', 'schneider-kreuznach-xenar-75mm-f-3-5', 'Schneider-Kreuznach', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Rolleicord_III'),
  ('Schneider-Kreuznach Xenar 60mm F/3.5', 'schneider-kreuznach-xenar-60mm-f-3-5', 'Schneider-Kreuznach', NULL, 'Prime lens', 60, 60, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Baby_Rolleiflex_(1957)'),
  ('Schneider Super-Angulon 50mm F/4', 'schneider-super-angulon-50mm-f-4', 'Schneider-Kreuznach', NULL, 'Prime lens', 50, 50, 4, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_4.0_FW'),
  ('Schneider Tele-Xenar 135mm F/4', 'schneider-tele-xenar-135mm-f-4', 'Schneider-Kreuznach', NULL, 'Prime lens', 135, 135, 4, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_4,0_FT'),
  ('Carl Zeiss Jena Triotar 75mm F/4.5', 'carl-zeiss-jena-triotar-75mm-f-4-5', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Rolleicord_I_(Art_Deco)'),
  ('Carl Zeiss Jena Triotar 75mm F/3.8', 'carl-zeiss-jena-triotar-75mm-f-3-8', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 3.8, NULL, true, 'https://camera-wiki.org/wiki/Rolleicord_I_Type_2'),
  ('Carl Zeiss Jena Triotar 75mm F/3.5', 'carl-zeiss-jena-triotar-75mm-f-3-5', 'Carl Zeiss', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Rolleicord_II'),
  ('Carl Zeiss Jena Tessar 60mm F/2.8', 'carl-zeiss-jena-tessar-60mm-f-2-8', 'Carl Zeiss', NULL, 'Prime lens', 60, 60, 2.8, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series'),
  ('Carl Zeiss Jena Tessar 60mm F/3.5', 'carl-zeiss-jena-tessar-60mm-f-3-5', 'Carl Zeiss', NULL, 'Prime lens', 60, 60, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series'),
  ('Yashica Yashinon 80mm F/3.5', 'yashica-yashinon-80mm-f-3-5', 'Yashica', NULL, 'Prime lens', 80, 80, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)'),
  ('Yashica Yashikor 80mm F/3.5', 'yashica-yashikor-80mm-f-3-5', 'Yashica', NULL, 'Prime lens', 80, 80, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)'),
  ('Minolta Rokkor 75mm F/3.5', 'minolta-rokkor-75mm-f-3-5', 'Minolta', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Minolta_Autocord'),
  ('Riken Ricoh 80mm F/3.5', 'riken-ricoh-80mm-f-3-5', 'Ricoh', NULL, 'Prime lens', 80, 80, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Ricohflex_Dia'),
  ('Riken Riconar 80mm F/3.5', 'riken-riconar-80mm-f-3-5', 'Ricoh', NULL, 'Prime lens', 80, 80, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Ricohflex_New_Dia'),
  ('Ricoh Rikenon 80mm F/3.5', 'ricoh-rikenon-80mm-f-3-5', 'Ricoh', NULL, 'Prime lens', 80, 80, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Ricohflex_Dia_L_-_Diacord_L'),
  ('LOMO T-22 75mm F/4.5', 'lomo-t-22-75mm-f-4-5', 'LOMO', NULL, 'Prime lens', 75, 75, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Lubitel_2'),
  ('Seagull HAIOU-31 SA 75mm F/3.5', 'seagull-haiou-31-sa-75mm-f-3-5', 'Seagull', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Seagull_4A'),
  ('Shanghai S13 75mm F/3.5', 'shanghai-s13-75mm-f-3-5', 'Shanghai', NULL, 'Prime lens', 75, 75, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Shanghai_(TLR)'),
  ('Mamiya Sekor 55mm F/4.5', 'mamiya-sekor-55mm-f-4-5', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 55, 55, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 65mm F/3.5', 'mamiya-sekor-65mm-f-3-5', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 65, 65, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 80mm F/2.8', 'mamiya-sekor-80mm-f-2-8', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 80, 80, 2.8, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 80mm F/3.7', 'mamiya-sekor-80mm-f-3-7', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 80, 80, 3.7, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 105mm F/3.5', 'mamiya-sekor-105mm-f-3-5', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 105, 105, 3.5, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 135mm F/4.5', 'mamiya-sekor-135mm-f-4-5', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 135, 135, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 180mm F/4.5', 'mamiya-sekor-180mm-f-4-5', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 180, 180, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C'),
  ('Mamiya Sekor 250mm F/4.5', 'mamiya-sekor-250mm-f-4-5', 'Mamiya', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Prime lens', 250, 250, 4.5, NULL, true, 'https://camera-wiki.org/wiki/Mamiya_C')
ON CONFLICT (slug) DO NOTHING;

--> statement-breakpoint

INSERT INTO cameras (name, slug, system_id, sensor_size, year_introduced, url, specs) VALUES
  ('Original Rolleiflex 6x6', 'original-rolleiflex-6x6-1929', NULL, 'Medium format 6x6', 1929, 'https://camera-wiki.org/wiki/Original_Rolleiflex_6×6', '{"Source":"https://camera-wiki.org/wiki/Original_Rolleiflex_6×6","Film type":"117 roll film; later 120 roll film","Maximum format":"Medium format 6x6","Lens options":"Zeiss Tessar 75mm f/4.5 or Zeiss Tessar 75mm f/3.8","Notes":"camera-wiki''s prose gives January 1929 while its specification line says 1928 to 1932; 1929 is used here."}'::jsonb),
  ('Rolleiflex Old Standard 620', 'rolleiflex-old-standard-620-1932', NULL, 'Medium format 6x6', 1932, 'https://camera-wiki.org/wiki/Rolleiflex_old_standard_model', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_old_standard_model","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, f/3.8 or f/4.5, uncoated"}'::jsonb),
  ('Rolleiflex Old Standard 621', 'rolleiflex-old-standard-621-1932', NULL, 'Medium format 6x6', 1932, 'https://camera-wiki.org/wiki/Rolleiflex_old_standard_model', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_old_standard_model","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, f/3.8 or f/4.5, uncoated"}'::jsonb),
  ('Rolleiflex Old Standard 622', 'rolleiflex-old-standard-622-1934', NULL, 'Medium format 6x6', 1934, 'https://camera-wiki.org/wiki/Rolleiflex_old_standard_model', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_old_standard_model","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, f/3.8 or f/4.5, uncoated"}'::jsonb),
  ('Rolleiflex Automat Model 1', 'rolleiflex-automat-model-1-1937', NULL, 'Medium format 6x6', 1937, 'https://camera-wiki.org/wiki/Rolleiflex_Automat_Model_1', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_Automat_Model_1","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex Automat Model 2', 'rolleiflex-automat-model-2-1938', NULL, 'Medium format 6x6', 1938, 'https://camera-wiki.org/wiki/Rolleiflex_Automat_Model_2', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_Automat_Model_2","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex Automat Model 3', 'rolleiflex-automat-model-3-1939', NULL, 'Medium format 6x6', 1939, 'https://camera-wiki.org/wiki/Rolleiflex_Automat_Model_3', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_Automat_Model_3","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, Zeiss Opton Tessar 75mm f/3.5 or Schneider-Kreuznach Xenar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex New Standard', 'rolleiflex-new-standard-1939', NULL, 'Medium format 6x6', 1939, 'https://camera-wiki.org/wiki/Rolleiflex_New_Standard', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_New_Standard","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex 3.5 (Automat Model X)', 'rolleiflex-3-5-automat-model-x-1949', NULL, 'Medium format 6x6', 1949, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, Zeiss Opton Tessar 75mm f/3.5 or Schneider-Kreuznach Xenar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 A', 'rolleiflex-3-5-a-1951', NULL, 'Medium format 6x6', 1951, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, Zeiss Opton Tessar 75mm f/3.5 or Schneider-Kreuznach Xenar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 B', 'rolleiflex-3-5-b-1954', NULL, 'Medium format 6x6', 1954, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5, Zeiss Opton Tessar 75mm f/3.5 or Schneider-Kreuznach Xenar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 C', 'rolleiflex-3-5-c-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 E2 Model 1', 'rolleiflex-3-5-e2-model-1-1959', NULL, 'Medium format 6x6', 1959, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 E2 Model 2', 'rolleiflex-3-5-e2-model-2-1961', NULL, 'Medium format 6x6', 1961, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 E3', 'rolleiflex-3-5-e3-1961', NULL, 'Medium format 6x6', 1961, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5, six elements"}'::jsonb),
  ('Rolleiflex 3.5 F Model 1', 'rolleiflex-3-5-f-model-1-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 F Model 2', 'rolleiflex-3-5-f-model-2-1960', NULL, 'Medium format 6x6', 1960, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5"}'::jsonb),
  ('Rolleiflex 3.5 F Model 3', 'rolleiflex-3-5-f-model-3-1960', NULL, 'Medium format 6x6', 1960, 'https://camera-wiki.org/wiki/Rolleiflex_3.5_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_3.5_series","Film type":"120 roll film; 220 roll film from November 1965","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 75mm f/3.5 or Schneider-Kreuznach Xenotar 75mm f/3.5, six elements"}'::jsonb),
  ('Rolleiflex 2.8 A', 'rolleiflex-2-8-a-1949', NULL, 'Medium format 6x6', 1949, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Jena Tessar 80mm f/2.8 or Zeiss Opton Tessar 80mm f/2.8","Notes":"The page prose calls it the K7A of 1950 while the specification line gives 1949 to 1951; 1949 is used here."}'::jsonb),
  ('Rolleiflex 2.8 B', 'rolleiflex-2-8-b-1952', NULL, 'Medium format 6x6', 1952, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex 2.8 C', 'rolleiflex-2-8-c-1952', NULL, 'Medium format 6x6', 1952, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Schneider-Kreuznach Xenotar 80mm f/2.8 or Carl Zeiss Planar 80mm f/2.8"}'::jsonb),
  ('Rolleiflex 2.8 D', 'rolleiflex-2-8-d-1955', NULL, 'Medium format 6x6', 1955, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Schneider-Kreuznach Xenotar 80mm f/2.8 or Carl Zeiss Planar 80mm f/2.8"}'::jsonb),
  ('Rolleiflex 2.8 E', 'rolleiflex-2-8-e-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Schneider-Kreuznach Xenotar 80mm f/2.8 or Carl Zeiss Planar 80mm f/2.8"}'::jsonb),
  ('Rolleiflex 2.8 E2', 'rolleiflex-2-8-e2-1959', NULL, 'Medium format 6x6', 1959, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Schneider-Kreuznach Xenotar 80mm f/2.8 or Carl Zeiss Planar 80mm f/2.8"}'::jsonb),
  ('Rolleiflex 2.8 E3', 'rolleiflex-2-8-e3-1962', NULL, 'Medium format 6x6', 1962, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Schneider-Kreuznach Xenotar 80mm f/2.8 or Carl Zeiss Planar 80mm f/2.8"}'::jsonb),
  ('Rolleiflex 2.8 F', 'rolleiflex-2-8-f-1960', NULL, 'Medium format 6x6', 1960, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_series","Film type":"120 roll film; 220 roll film from late 1965","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Planar 80mm f/2.8, or Schneider-Kreuznach Xenotar 80mm f/2.8 on the K7F4"}'::jsonb),
  ('Rolleiflex T Model 1', 'rolleiflex-t-model-1-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Rolleiflex_T', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_T","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Masks allow 4x4cm and 4x5.5cm frames."}'::jsonb),
  ('Rolleiflex T Model 2', 'rolleiflex-t-model-2-1961', NULL, 'Medium format 6x6', 1961, 'https://camera-wiki.org/wiki/Rolleiflex_T', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_T","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex T Model 3', 'rolleiflex-t-model-3-1966', NULL, 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Rolleiflex_T', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_T","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Tessar 75mm f/3.5 or Schneider-Kreuznach Xenar 75mm f/3.5"}'::jsonb),
  ('Tele Rolleiflex', 'tele-rolleiflex-1959', NULL, 'Medium format 6x6', 1959, 'https://camera-wiki.org/wiki/Tele_Rolleiflex', '{"Source":"https://camera-wiki.org/wiki/Tele_Rolleiflex","Film type":"120 roll film; 220 roll film on Model 2","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Wide-Angle Rolleiflex', 'wide-angle-rolleiflex-1961', NULL, 'Medium format 6x6', 1961, 'https://camera-wiki.org/wiki/Wide-Angle_Rolleiflex', '{"Source":"https://camera-wiki.org/wiki/Wide-Angle_Rolleiflex","Film type":"120 roll film; 220 roll film on Model 2","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex 2.8 GX Model 1', 'rolleiflex-2-8-gx-model-1-1987', NULL, 'Medium format 6x6', 1987, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_GX', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_GX","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex 2.8 GX Model 2', 'rolleiflex-2-8-gx-model-2-1995', NULL, 'Medium format 6x6', 1995, 'https://camera-wiki.org/wiki/Rolleiflex_2.8_GX', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2.8_GX","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex 2.8 FX', 'rolleiflex-2-8-fx-2002', NULL, 'Medium format 6x6', 2002, 'https://camera-wiki.org/wiki/Rolleiflex_2,8_FX', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2,8_FX","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"The Planar was renamed S-Apogon under DHW."}'::jsonb),
  ('Rolleiflex 2.8 FX-N', 'rolleiflex-2-8-fx-n-2013', NULL, 'Medium format 6x6', 2013, 'https://camera-wiki.org/wiki/Rolleiflex_2,8_FX', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_2,8_FX","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Shown at Photokina 2012 and available from early 2013."}'::jsonb),
  ('Rolleiflex 4.0 FW', 'rolleiflex-4-0-fw-2003', NULL, 'Medium format 6x6', 2003, 'https://camera-wiki.org/wiki/Rolleiflex_4.0_FW', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_4.0_FW","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"The model page says 2003 while the Rolleiflex index says 2002; 2003 is used here."}'::jsonb),
  ('Rolleiflex 4.0 FT', 'rolleiflex-4-0-ft-2007', NULL, 'Medium format 6x6', 2007, 'https://camera-wiki.org/wiki/Rolleiflex_4,0_FT', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_4,0_FT","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleiflex 4x4 Model 1', 'rolleiflex-4x4-model-1-1931', NULL, 'Medium format 4x4', 1931, 'https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series","Film type":"127 roll film","Maximum format":"Medium format 4x4","Lens options":"Carl Zeiss Jena Tessar 60mm f/3.5 or f/2.8"}'::jsonb),
  ('Rolleiflex 4x4 Model 2', 'rolleiflex-4x4-model-2-1933', NULL, 'Medium format 4x4', 1933, 'https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series","Film type":"127 roll film","Maximum format":"Medium format 4x4","Lens options":"Carl Zeiss Jena Tessar 60mm f/3.5 or f/2.8"}'::jsonb),
  ('Rolleiflex 4x4 Model 3', 'rolleiflex-4x4-model-3-1934', NULL, 'Medium format 4x4', 1934, 'https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series","Film type":"127 roll film","Maximum format":"Medium format 4x4","Lens options":"Carl Zeiss Jena Tessar 60mm f/3.5 or f/2.8"}'::jsonb),
  ('Sports Rolleiflex 4x4', 'sports-rolleiflex-4x4-1938', NULL, 'Medium format 4x4', 1938, 'https://camera-wiki.org/wiki/Sports_Rolleiflex', '{"Source":"https://camera-wiki.org/wiki/Sports_Rolleiflex","Film type":"127 roll film","Maximum format":"Medium format 4x4"}'::jsonb),
  ('Rolleiflex 4x4 Kriegsmodell', 'rolleiflex-4x4-kriegsmodell-1941', NULL, 'Medium format 4x4', 1941, 'https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series', '{"Source":"https://camera-wiki.org/wiki/Rolleiflex_4x4_prewar_series","Film type":"127 roll film","Maximum format":"Medium format 4x4"}'::jsonb),
  ('Baby Rolleiflex 4x4', 'baby-rolleiflex-4x4-1957', NULL, 'Medium format 4x4', 1957, 'https://camera-wiki.org/wiki/Baby_Rolleiflex_(1957)', '{"Source":"https://camera-wiki.org/wiki/Baby_Rolleiflex_(1957)","Film type":"127 roll film","Maximum format":"Medium format 4x4"}'::jsonb),
  ('Rollei Magic', 'rollei-magic-1960', NULL, 'Medium format 6x6', 1960, 'https://camera-wiki.org/wiki/Rollei_Magic', '{"Source":"https://camera-wiki.org/wiki/Rollei_Magic","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rollei Magic II', 'rollei-magic-ii-1962', NULL, 'Medium format 6x6', 1962, 'https://camera-wiki.org/wiki/Rollei_Magic', '{"Source":"https://camera-wiki.org/wiki/Rollei_Magic","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord I', 'rolleicord-i-1933', NULL, 'Medium format 6x6', 1933, 'https://camera-wiki.org/wiki/Rolleicord_I_(Art_Deco)', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_I_(Art_Deco)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"The Art Deco model."}'::jsonb),
  ('Rolleicord I Type 2', 'rolleicord-i-type-2-1934', NULL, 'Medium format 6x6', 1934, 'https://camera-wiki.org/wiki/Rolleicord_I_Type_2', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_I_Type_2","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Ia Version 1', 'rolleicord-ia-version-1-1936', NULL, 'Medium format 6x6', 1936, 'https://camera-wiki.org/wiki/Rolleicord_Ia', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Ia","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Ia Version 2', 'rolleicord-ia-version-2-1937', NULL, 'Medium format 6x6', 1937, 'https://camera-wiki.org/wiki/Rolleicord_Ia', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Ia","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Ia Version 3', 'rolleicord-ia-version-3-1937', NULL, 'Medium format 6x6', 1937, 'https://camera-wiki.org/wiki/Rolleicord_Ia', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Ia","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"The Rolleicord index gives 1938 to 1947 while the model page says 1937 to 1947."}'::jsonb),
  ('Rolleicord II', 'rolleicord-ii-1936', NULL, 'Medium format 6x6', 1936, 'https://camera-wiki.org/wiki/Rolleicord_II', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_II","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord IIa', 'rolleicord-iia-1937', NULL, 'Medium format 6x6', 1937, 'https://camera-wiki.org/wiki/Rolleicord_IIa', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_IIa","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord IIb', 'rolleicord-iib-1938', NULL, 'Medium format 6x6', 1938, 'https://camera-wiki.org/wiki/Rolleicord_IIb', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_IIb","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord IIc', 'rolleicord-iic-1939', NULL, 'Medium format 6x6', 1939, 'https://camera-wiki.org/wiki/Rolleicord_IIc', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_IIc","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord IId', 'rolleicord-iid-1947', NULL, 'Medium format 6x6', 1947, 'https://camera-wiki.org/wiki/Rolleicord_IId', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_IId","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Triotar 75mm f/3.5, Schneider Xenar 75mm f/4.5 or Schneider Xenar 75mm f/3.5"}'::jsonb),
  ('Rolleicord IIe', 'rolleicord-iie-1949', NULL, 'Medium format 6x6', 1949, 'https://camera-wiki.org/wiki/Rolleicord_IIe', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_IIe","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Carl Zeiss Triotar 75mm f/3.5 or Schneider Xenar 75mm f/3.5, both coated"}'::jsonb),
  ('Rolleicord III', 'rolleicord-iii-1950', NULL, 'Medium format 6x6', 1950, 'https://camera-wiki.org/wiki/Rolleicord_III', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_III","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Schneider-Kreuznach Xenar 75mm f/3.5 or Carl Zeiss Triotar 75mm f/3.5"}'::jsonb),
  ('Rolleicord IV', 'rolleicord-iv-1953', NULL, 'Medium format 6x6', 1953, 'https://camera-wiki.org/wiki/Rolleicord_IV', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_IV","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord V', 'rolleicord-v-1954', NULL, 'Medium format 6x6', 1954, 'https://camera-wiki.org/wiki/Rolleicord_V', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_V","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Va Version 1', 'rolleicord-va-version-1-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Rolleicord_Va', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Va","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Va Version 2', 'rolleicord-va-version-2-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Rolleicord_Va', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Va","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Vb Version 1', 'rolleicord-vb-version-1-1962', NULL, 'Medium format 6x6', 1962, 'https://camera-wiki.org/wiki/Rolleicord_Vb', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Vb","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Vb Version 2', 'rolleicord-vb-version-2-1966', NULL, 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Rolleicord_Vb', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Vb","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Rolleicord Vb Version 3', 'rolleicord-vb-version-3-1970', NULL, 'Medium format 6x6', 1970, 'https://camera-wiki.org/wiki/Rolleicord_Vb', '{"Source":"https://camera-wiki.org/wiki/Rolleicord_Vb","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"The white face model."}'::jsonb),
  ('Mamiyaflex C', 'mamiyaflex-c-1956', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Mamiya_C', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiyaflex C2', 'mamiyaflex-c2-1958', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Mamiyaflex_C2', '{"Source":"https://camera-wiki.org/wiki/Mamiyaflex_C2","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C3', 'mamiya-c3-1962', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1962, 'https://camera-wiki.org/wiki/Mamiya_C3', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C3","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C33', 'mamiya-c33-1965', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1965, 'https://camera-wiki.org/wiki/Mamiya_C33', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C33","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C22', 'mamiya-c22-1966', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Mamiya_C22', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C22","Film type":"120 roll film; 220 roll film with the optional back","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C220', 'mamiya-c220-1968', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1968, 'https://camera-wiki.org/wiki/Mamiya_C220', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C220","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C330', 'mamiya-c330-1969', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1969, 'https://camera-wiki.org/wiki/Mamiya_C330', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C330","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C330f Professional F', 'mamiya-c330f-professional-f-1972', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1972, 'https://camera-wiki.org/wiki/Mamiya_C330', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C330","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C220f', 'mamiya-c220f-1982', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1982, 'https://camera-wiki.org/wiki/Mamiya_C220', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C220","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Mamiya C330s Professional S', 'mamiya-c330s-professional-s-1983', (SELECT id FROM systems WHERE slug = 'mamiya-tlr'), 'Medium format 6x6', 1983, 'https://camera-wiki.org/wiki/Mamiya_C330', '{"Source":"https://camera-wiki.org/wiki/Mamiya_C330","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Yashica-Mat', 'yashica-mat-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Lumaxar 75mm f/3.5, then Lumaxar 80mm f/3.5, later renamed Yashinon"}'::jsonb),
  ('Yashica-Mat LM', 'yashica-mat-lm-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Yashica-Mat EM', 'yashica-mat-em-1964', NULL, 'Medium format 6x6', 1964, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Yashica-24', 'yashica-24-1965', NULL, 'Medium format 6x6', 1965, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"220 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki says circa 1965; Paul Sokk gives December 1965."}'::jsonb),
  ('Yashica-12', 'yashica-12-1967', NULL, 'Medium format 6x6', 1967, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Year from Paul Sokk''s dating table, not from camera-wiki."}'::jsonb),
  ('Yashica Mat-124', 'yashica-mat-124-1968', NULL, 'Medium format 6x6', 1968, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6","Notes":"Year from Paul Sokk''s dating table, not from camera-wiki."}'::jsonb),
  ('Yashica Mat-124 G', 'yashica-mat-124-g-1970', NULL, 'Medium format 6x6', 1970, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(crank_advance)","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Yashica LM', 'yashica-lm-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"October 1956 per Paul Sokk''s dating table."}'::jsonb),
  ('Yashica-A', 'yashica-a-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Dating is disputed: period advertising places it in 1956 while McKeown gives circa 1959. Earlier examples carry a Yashimar."}'::jsonb),
  ('Yashica-B', 'yashica-b-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki names a Yashikor but gives neither focal length nor aperture. Year from Paul Sokk."}'::jsonb),
  ('Yashica-C', 'yashica-c-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki names no lens. Dating is disputed: period advertising places it in 1956 while McKeown gives circa 1958."}'::jsonb),
  ('Yashica-D', 'yashica-d-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Yashikor 80mm f/3.5 three-element, later Yashinon 80mm f/3.5 four-element"}'::jsonb),
  ('Yashica-635', 'yashica-635-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film; 135 film with the adapter kit","Maximum format":"Medium format 6x6","Notes":"camera-wiki names a Yashikor upgradable to Yashinon but gives no focal length or aperture, so none is asserted here."}'::jsonb),
  ('Yashica-E', 'yashica-e-1964', NULL, 'Medium format 6x6', 1964, 'https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)', '{"Source":"https://camera-wiki.org/wiki/Yashica_6×6_TLR_(knob_advance)","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Minolta Autocord MXS', 'minolta-autocord-mxs-1955', NULL, 'Medium format 6x6', 1955, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord MXV', 'minolta-autocord-mxv-1955', NULL, 'Medium format 6x6', 1955, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord L', 'minolta-autocord-l-1955', NULL, 'Medium format 6x6', 1955, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord LMX', 'minolta-autocord-lmx-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord', 'minolta-autocord-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord RG I', 'minolta-autocord-rg-i-1961', NULL, 'Medium format 6x6', 1961, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord RG II', 'minolta-autocord-rg-ii-1962', NULL, 'Medium format 6x6', 1962, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord RG III', 'minolta-autocord-rg-iii-1963', NULL, 'Medium format 6x6', 1963, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord CDS', 'minolta-autocord-cds-1965', NULL, 'Medium format 6x6', 1965, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord I', 'minolta-autocord-i-1965', NULL, 'Medium format 6x6', 1965, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Minolta Autocord II', 'minolta-autocord-ii-1966', NULL, 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord III', 'minolta-autocord-iii-1966', NULL, 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord CDS II', 'minolta-autocord-cds-ii-1966', NULL, 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Minolta Autocord CDS III', 'minolta-autocord-cds-iii-1966', NULL, 'Medium format 6x6', 1966, 'https://camera-wiki.org/wiki/Minolta_Autocord', '{"Source":"https://camera-wiki.org/wiki/Minolta_Autocord","Film type":"120 roll film; 220 roll film","Maximum format":"Medium format 6x6","Lens options":"Rokkor f/3.5, a four-element Tessar type. camera-wiki states 75mm only for the Autocord I."}'::jsonb),
  ('Ricohflex Dia', 'ricohflex-dia-1955', NULL, 'Medium format 6x6', 1955, 'https://camera-wiki.org/wiki/Ricohflex_Dia', '{"Source":"https://camera-wiki.org/wiki/Ricohflex_Dia","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Ricohflex Dia M', 'ricohflex-dia-m-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Ricohflex_Dia_M', '{"Source":"https://camera-wiki.org/wiki/Ricohflex_Dia_M","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Three elements in three groups, unlike the four-element Dia."}'::jsonb),
  ('Ricohflex New Dia', 'ricohflex-new-dia-1956', NULL, 'Medium format 6x6', 1956, 'https://camera-wiki.org/wiki/Ricohflex_New_Dia', '{"Source":"https://camera-wiki.org/wiki/Ricohflex_New_Dia","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Ricohflex New Dia 2', 'ricohflex-new-dia-2-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Ricohflex_New_Dia_2', '{"Source":"https://camera-wiki.org/wiki/Ricohflex_New_Dia_2","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki gives 80mm f/3.5, four elements in three groups, but does not name the lens."}'::jsonb),
  ('Ricoh Diacord L', 'ricoh-diacord-l-1957', NULL, 'Medium format 6x6', 1957, 'https://camera-wiki.org/wiki/Ricohflex_Dia_L_-_Diacord_L', '{"Source":"https://camera-wiki.org/wiki/Ricohflex_Dia_L_-_Diacord_L","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Sold as Ricohflex Dia L in Japan."}'::jsonb),
  ('Ricoh Diacord G', 'ricoh-diacord-g-1958', NULL, 'Medium format 6x6', 1958, 'https://camera-wiki.org/wiki/Ricoh_Diacord_G', '{"Source":"https://camera-wiki.org/wiki/Ricoh_Diacord_G","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Lubitel', 'lubitel-1949', NULL, 'Medium format 6x6', 1949, 'https://camera-wiki.org/wiki/Lubitel', '{"Source":"https://camera-wiki.org/wiki/Lubitel","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Lubitel 2', 'lubitel-2-1954', NULL, 'Medium format 6x6', 1954, 'https://camera-wiki.org/wiki/Lubitel_2', '{"Source":"https://camera-wiki.org/wiki/Lubitel_2","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Lubitel 166', 'lubitel-166-1976', NULL, 'Medium format 6x6', 1976, 'https://camera-wiki.org/wiki/Lubitel_166', '{"Source":"https://camera-wiki.org/wiki/Lubitel_166","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki gives the year as circa 1976."}'::jsonb),
  ('Lubitel 166B', 'lubitel-166b-1980', NULL, 'Medium format 6x6', 1980, 'https://camera-wiki.org/wiki/Lubitel_166B', '{"Source":"https://camera-wiki.org/wiki/Lubitel_166B","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki gives the year as circa 1980."}'::jsonb),
  ('Lubitel 166 Universal', 'lubitel-166-universal-1983', NULL, 'Medium format 6x6', 1983, 'https://camera-wiki.org/wiki/Lubitel_166_Universal', '{"Source":"https://camera-wiki.org/wiki/Lubitel_166_Universal","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"Shoots 6x6 and 6x4.5."}'::jsonb),
  ('Shanghai TLR', 'shanghai-tlr-1960', NULL, 'Medium format 6x6', 1960, 'https://camera-wiki.org/wiki/Shanghai_(TLR)', '{"Source":"https://camera-wiki.org/wiki/Shanghai_(TLR)","Film type":"120 roll film","Maximum format":"Medium format 6x6"}'::jsonb),
  ('Seagull 4', 'seagull-4-1964', NULL, 'Medium format 6x6', 1964, 'https://camera-wiki.org/wiki/Seagull', '{"Source":"https://camera-wiki.org/wiki/Seagull","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"A development of the Shanghai TLR, originally called the 58-III. camera-wiki names no lens."}'::jsonb),
  ('Seagull 4A', 'seagull-4a', NULL, 'Medium format 6x6', NULL, 'https://camera-wiki.org/wiki/Seagull_4A', '{"Source":"https://camera-wiki.org/wiki/Seagull_4A","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki''s prose says the late 1960s while its category tag says 1964, so no year is recorded."}'::jsonb),
  ('Seagull 4A-103', 'seagull-4a-103', NULL, 'Medium format 6x6', NULL, 'https://camera-wiki.org/wiki/Seagull_4A-103', '{"Source":"https://camera-wiki.org/wiki/Seagull_4A-103","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki gives 75mm f/3.5 in three groups and three elements but no year and no lens name."}'::jsonb),
  ('Seagull 4B', 'seagull-4b', NULL, 'Medium format 6x6', NULL, 'https://camera-wiki.org/wiki/Seagull_4B', '{"Source":"https://camera-wiki.org/wiki/Seagull_4B","Film type":"120 roll film","Maximum format":"Medium format 6x6","Notes":"camera-wiki carries no year in prose and names no lens."}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

--> statement-breakpoint

UPDATE cameras c
SET built_in_lens_id = l.id
FROM (VALUES
    ('rolleiflex-automat-model-1-1937', 'carl-zeiss-tessar-75mm-f-3-5'),
    ('rolleiflex-automat-model-2-1938', 'carl-zeiss-tessar-75mm-f-3-5'),
    ('rolleiflex-new-standard-1939', 'carl-zeiss-tessar-75mm-f-3-5'),
    ('rolleiflex-2-8-b-1952', 'carl-zeiss-jena-biometar-80mm-f-2-8'),
    ('rolleiflex-t-model-1-1958', 'carl-zeiss-tessar-75mm-f-3-5'),
    ('rolleiflex-t-model-2-1961', 'carl-zeiss-tessar-75mm-f-3-5'),
    ('tele-rolleiflex-1959', 'carl-zeiss-sonnar-135mm-f-4'),
    ('wide-angle-rolleiflex-1961', 'carl-zeiss-distagon-55mm-f-4'),
    ('rolleiflex-2-8-gx-model-1-1987', 'carl-zeiss-planar-80mm-f-2-8'),
    ('rolleiflex-2-8-gx-model-2-1995', 'carl-zeiss-planar-80mm-f-2-8'),
    ('rolleiflex-2-8-fx-2002', 'carl-zeiss-planar-80mm-f-2-8'),
    ('rolleiflex-2-8-fx-n-2013', 'carl-zeiss-planar-80mm-f-2-8'),
    ('rolleiflex-4-0-fw-2003', 'schneider-super-angulon-50mm-f-4'),
    ('rolleiflex-4-0-ft-2007', 'schneider-tele-xenar-135mm-f-4'),
    ('sports-rolleiflex-4x4-1938', 'carl-zeiss-jena-tessar-60mm-f-2-8'),
    ('rolleiflex-4x4-kriegsmodell-1941', 'carl-zeiss-jena-tessar-60mm-f-2-8'),
    ('baby-rolleiflex-4x4-1957', 'schneider-kreuznach-xenar-60mm-f-3-5'),
    ('rollei-magic-1960', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rollei-magic-ii-1962', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-i-1933', 'carl-zeiss-jena-triotar-75mm-f-4-5'),
    ('rolleicord-i-type-2-1934', 'carl-zeiss-jena-triotar-75mm-f-3-8'),
    ('rolleicord-ia-version-1-1936', 'carl-zeiss-jena-triotar-75mm-f-4-5'),
    ('rolleicord-ia-version-2-1937', 'carl-zeiss-jena-triotar-75mm-f-4-5'),
    ('rolleicord-ia-version-3-1937', 'carl-zeiss-jena-triotar-75mm-f-4-5'),
    ('rolleicord-ii-1936', 'carl-zeiss-jena-triotar-75mm-f-3-5'),
    ('rolleicord-iia-1937', 'carl-zeiss-jena-triotar-75mm-f-3-5'),
    ('rolleicord-iib-1938', 'carl-zeiss-jena-triotar-75mm-f-3-5'),
    ('rolleicord-iic-1939', 'carl-zeiss-jena-triotar-75mm-f-3-5'),
    ('rolleicord-iv-1953', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-v-1954', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-va-version-1-1957', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-va-version-2-1958', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-vb-version-1-1962', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-vb-version-2-1966', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('rolleicord-vb-version-3-1970', 'schneider-kreuznach-xenar-75mm-f-3-5'),
    ('yashica-mat-lm-1958', 'yashica-yashinon-80mm-f-3-5'),
    ('yashica-mat-em-1964', 'yashica-yashinon-80mm-f-3-5'),
    ('yashica-mat-124-1968', 'yashica-yashinon-80mm-f-3-5'),
    ('yashica-mat-124-g-1970', 'yashica-yashinon-80mm-f-3-5'),
    ('yashica-lm-1956', 'yashica-yashikor-80mm-f-3-5'),
    ('yashica-a-1956', 'yashica-yashikor-80mm-f-3-5'),
    ('yashica-e-1964', 'yashica-yashinon-80mm-f-3-5'),
    ('minolta-autocord-i-1965', 'minolta-rokkor-75mm-f-3-5'),
    ('ricohflex-dia-1955', 'riken-ricoh-80mm-f-3-5'),
    ('ricohflex-dia-m-1956', 'riken-ricoh-80mm-f-3-5'),
    ('ricohflex-new-dia-1956', 'riken-riconar-80mm-f-3-5'),
    ('ricoh-diacord-l-1957', 'ricoh-rikenon-80mm-f-3-5'),
    ('ricoh-diacord-g-1958', 'ricoh-rikenon-80mm-f-3-5'),
    ('lubitel-1949', 'lomo-t-22-75mm-f-4-5'),
    ('lubitel-2-1954', 'lomo-t-22-75mm-f-4-5'),
    ('lubitel-166-1976', 'lomo-t-22-75mm-f-4-5'),
    ('lubitel-166b-1980', 'lomo-t-22-75mm-f-4-5'),
    ('lubitel-166-universal-1983', 'lomo-t-22-75mm-f-4-5'),
    ('shanghai-tlr-1960', 'shanghai-s13-75mm-f-3-5'),
    ('seagull-4a', 'seagull-haiou-31-sa-75mm-f-3-5')
) AS v(camera_slug, lens_slug)
JOIN lenses l ON l.slug = v.lens_slug
WHERE c.slug = v.camera_slug AND c.built_in_lens_id IS NULL;
