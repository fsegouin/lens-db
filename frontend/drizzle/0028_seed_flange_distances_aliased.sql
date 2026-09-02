-- Seed 11 more mounts whose register is recorded under a different name.
--
-- Migration 0027 matched the spec entry to the mount's own name, which missed
-- mounts the source spells differently: the Leica screw mount appears as
-- "Leica [28.8mm]", Pentacon Six as "Praktisix (Pentacon Six)[74mm]". Here a
-- lens filed under one mount that quotes exactly one register settles that
-- mount, whatever name the string uses. Same thresholds: at least 90%
-- agreement over at least two lenses, nulls only.
--
-- Spot checks: Leica screw mount 28.8, Pentax 6x7 84.95, Contax rangefinder
-- 34.85, Pentacon Six 74 all match published registers.

UPDATE systems SET flange_distance_mm = 28.8 WHERE slug = 'leica-screw-mount-m39-ltm' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 84.95 WHERE slug = 'pentax-6x7' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 74 WHERE slug = 'rolleiflex-slx-6000' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 34.85 WHERE slug = 'contax-rangefinder' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 74 WHERE slug = 'pentacon-six-praktisix' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 82.1 WHERE slug = 'hasselblad-1600f-1000f-m60x6' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.2 WHERE slug = 'zenit-m39-slr' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 45.5 WHERE slug = 'asahiflex-m37' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 28.8 WHERE slug = 'canon-s-j' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 74 WHERE slug = 'exakta-66' AND flange_distance_mm IS NULL;
UPDATE systems SET flange_distance_mm = 44 WHERE slug = 'praktiflex' AND flange_distance_mm IS NULL;
