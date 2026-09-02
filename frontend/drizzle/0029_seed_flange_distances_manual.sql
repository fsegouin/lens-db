-- Three mounts the spec-string passes could not settle, filled from the
-- published standards. Each has real camera bodies recorded here, so leaving
-- them blank keeps them out of the adapter matrix entirely.
--
-- Micro Four Thirds is the notable one: 95 bodies and 146 lenses, and one of
-- the most-adapted-onto mounts in use. Its lenses' spec strings quote the
-- adapted lens's register rather than the body's, which is why 0027 and 0028
-- both missed it.
--
--   Micro Four Thirds  19.25 mm
--   Four Thirds        38.67 mm
--   Sigma SA           44 mm
--
-- Deliberately left null: T-mount, Tamron Adaptall/Adaptall-2, T-4 and
-- "Interchangeable mount" are mount-agnostic systems sold with a swappable
-- rear adapter, so no single register describes them. Bronica is left null
-- too, since ETR, SQ and GS do not share one.

UPDATE systems SET flange_distance_mm = 19.25
  WHERE name = 'Micro Four Thirds' AND flange_distance_mm IS NULL;

UPDATE systems SET flange_distance_mm = 38.67
  WHERE name = 'Four Thirds' AND flange_distance_mm IS NULL;

UPDATE systems SET flange_distance_mm = 44
  WHERE name = 'Sigma SA' AND flange_distance_mm IS NULL;
