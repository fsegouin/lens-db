-- Merge duplicate Canon "EOS" system entries into their mount-named counterparts.
-- The mount names (EF, EF-S, EF-M, RF, RF-S) are unambiguous and technically precise,
-- while the "EOS" names create confusion with other Canon systems.

BEGIN;

-- 1. Reassign lenses and cameras from EOS entries to mount entries
-- Canon EOS (143) → Canon EF (119): 19 cameras, 0 lenses
UPDATE cameras SET system_id = 119 WHERE system_id = 143;

-- Canon EOS APS-C (142) → Canon EF-S (108): 33 cameras, 0 lenses
UPDATE cameras SET system_id = 108 WHERE system_id = 142;

-- Canon EOS M (144) → Canon EF-M (87): 10 cameras, 1 lens
UPDATE cameras SET system_id = 87 WHERE system_id = 144;
UPDATE lenses SET system_id = 87 WHERE system_id = 144;

-- Canon EOS R (145) → Canon RF (75): 1 camera, 109 lenses
UPDATE cameras SET system_id = 75 WHERE system_id = 145;
UPDATE lenses SET system_id = 75 WHERE system_id = 145;

-- Canon EOS R APS-C (375) → Canon RF-S (417): 0 cameras, 1 lens
UPDATE cameras SET system_id = 417 WHERE system_id = 375;
UPDATE lenses SET system_id = 417 WHERE system_id = 375;

-- 2. Merge view counts into the target systems
UPDATE systems SET view_count = view_count + (SELECT view_count FROM systems WHERE id = 143) WHERE id = 119;
UPDATE systems SET view_count = view_count + (SELECT view_count FROM systems WHERE id = 142) WHERE id = 108;
UPDATE systems SET view_count = view_count + (SELECT view_count FROM systems WHERE id = 144) WHERE id = 87;
UPDATE systems SET view_count = view_count + (SELECT view_count FROM systems WHERE id = 145) WHERE id = 75;
UPDATE systems SET view_count = view_count + (SELECT view_count FROM systems WHERE id = 375) WHERE id = 417;

-- 3. Delete the now-empty EOS system entries
DELETE FROM systems WHERE id IN (143, 142, 144, 145, 375);

COMMIT;
