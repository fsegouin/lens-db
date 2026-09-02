-- Seed the flange focal distance for 62 mounts.
--
-- The figures were already in the catalogue, not invented here: 6,708 lenses
-- carry a "Mount and Flange focal distance" spec in the form
-- "Canon EF[44mm]; Nikon F[46.5mm]", and each lens's own mount is one of the
-- entries. Each value below is the one its own mount's lenses agree on, taking
-- only mounts where at least 90% of at least two lenses agree. Spot checks
-- against published registers match: Canon EF 44, Nikon F 46.5, Leica M 27.8,
-- Nikon Z 16, Hasselblad V 74.9, Fujifilm X 17.7.
--
-- Left null because the lenses disagree (2): bronica 54%, mamiya-e 87%.
-- "bronica" is one name covering several registers (S, ETR, SQ, GS), so it
-- needs splitting into separate mounts rather than a single number.
--
-- Left null on a single lens's word (4): mamiya-6, start, altix, mamiya-7.
-- These may well be correct, but one row is not enough to publish a fact on.
--
-- Only fills nulls, so a hand-corrected value is never overwritten.

UPDATE systems SET flange_distance_mm = 44 WHERE slug = 'canon-ef' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 42 WHERE slug = 'canon-fd' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.5 WHERE slug = 'm42' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 46.5 WHERE slug = 'nikon-f' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.5 WHERE slug = 'pentax-k' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 27.8 WHERE slug = 'leica-m' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 43.5 WHERE slug = 'minolta-sr' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44.7 WHERE slug = 'exakta' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44.5 WHERE slug = 'minoltasony-a' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 17.7 WHERE slug = 'fujifilm-x' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 20 WHERE slug = 'canon-rf' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.5 WHERE slug = 'contaxyashica' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 47 WHERE slug = 'leica-r' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 18 WHERE slug = 'canon-ef-m' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 18 WHERE slug = 'sony-e' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 74.9 WHERE slug = 'hasselblad-v' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 46 WHERE slug = 'olympus-om' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 63 WHERE slug = 'mamiya-m645' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 40.5 WHERE slug = 'konica-ar' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 16 WHERE slug = 'nikon-z' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 42 WHERE slug = 'canon-fl' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 69 WHERE slug = 'bronica-etr' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44.46 WHERE slug = 'rollei-qbm' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 20 WHERE slug = 'leica-l' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 85 WHERE slug = 'bronica-sq' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 70.87 WHERE slug = 'pentax-645' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 37.8 WHERE slug = 'alpa' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 104 WHERE slug = 'mamiya-rz67' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 43.5 WHERE slug = 'fujica-x' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 26.7 WHERE slug = 'fujifilm-g' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 111 WHERE slug = 'mamiya-rb67' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 43.5 WHERE slug = 'petri' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 46 WHERE slug = 'contarex' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44.7 WHERE slug = 'topcon' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 18.14 WHERE slug = 'hasselblad-x' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 42 WHERE slug = 'canon-r' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 34.85 WHERE slug = 'nikon-s' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 53 WHERE slug = 'leica-s' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44.4 WHERE slug = 'praktica-b' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.54 WHERE slug = 'mamiya-cs' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 28.95 WHERE slug = 'olympus-pen-f' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 48 WHERE slug = 'contax-n' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 102.8 WHERE slug = 'rolleiflex-sl66' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 64 WHERE slug = 'contax-645' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.8 WHERE slug = 'yashica-ma' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44.5 WHERE slug = 'mamiya-es' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 79 WHERE slug = 'kowa-six' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 40.5 WHERE slug = 'konica-f' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 46 WHERE slug = 'olympus-om-af' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 85 WHERE slug = 'bronica-gs-1' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 68.2 WHERE slug = 'norita-66' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 41.5 WHERE slug = 'miranda' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 43.4 WHERE slug = 'rectaflex' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 48 WHERE slug = 'icarex' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 28.95 WHERE slug = 'contax-g' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 43 WHERE slug = 'yashica-pentamatic' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 42.05 WHERE slug = 'wrayflex' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 25.5 WHERE slug = 'samsung-nx' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 43.5 WHERE slug = 'agfa-ambi-silette' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 61.63 WHERE slug = 'hasselblad-h' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 34.27 WHERE slug = 'hasselblad-xpan' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.7 WHERE slug = 'deckel' AND flange_distance_mm IS NULL;
