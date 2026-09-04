-- Wikidata items for the mounts, so other tools can resolve our records to
-- theirs. This is the hub half of the identifier crosswalk.
--
-- Matched conservatively rather than by name. Wikidata files most mounts as a
-- "technical standard" and not as a lens mount, so only 10 items in the whole
-- database carry the lens-mount class; a name search is the only route, and a
-- name search alone returns the camera or the manufacturer just as often. Six
-- candidates were rejected on exactly that: Contarex resolved to a
-- manufacturer, and Praktiflex, Rectaflex, Wrayflex, Contax G and Mamiya RB67
-- each resolved to a camera.
--
-- So a match is kept only when the normalised label or an alias equals our
-- mount name AND the item's own description says it is a mount. That yields
-- 24 of 129. The rest are left null rather than guessed at.

ALTER TABLE systems ADD COLUMN IF NOT EXISTS wikidata_qid text;

UPDATE systems SET wikidata_qid = 'Q209633' WHERE slug = 'canon-ef' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q209695' WHERE slug = 'canon-ef-m' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q209659' WHERE slug = 'canon-fd' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q1389149' WHERE slug = 'canon-fl' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q738006' WHERE slug = 'canon-r' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q56487870' WHERE slug = 'canon-rf' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q5507381' WHERE slug = 'fujica-x' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q209708' WHERE slug = 'fujifilm-x' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q6429318' WHERE slug = 'konica-ar' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q30242162' WHERE slug = 'leica-l' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q313909' WHERE slug = 'leica-m' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q1280745' WHERE slug = 'leica-r' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q1365051' WHERE slug = 'm42' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q354639' WHERE slug = 'minolta-sr' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q93891945' WHERE slug = 'minoltasony-a' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q7036458' WHERE slug = 'nikon-1' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q1149640' WHERE slug = 'nikon-f' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q7036544' WHERE slug = 'nikon-s' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q56240413' WHERE slug = 'nikon-z' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q1063852' WHERE slug = 'pentax-k' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q116710490' WHERE slug = 'pentax-q' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q209743' WHERE slug = 'samsung-nx' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q4075657' WHERE slug = 'sigma-sa' AND wikidata_qid IS NULL;
UPDATE systems SET wikidata_qid = 'Q209536' WHERE slug = 'sony-e' AND wikidata_qid IS NULL;
