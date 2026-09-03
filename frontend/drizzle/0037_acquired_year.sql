-- When someone bought a lens, they remember the year. Asking for a full date
-- gets a made-up month, so the column holds the year and nothing else.
--
-- acquired_on had no field in the interface and never carried a value, so
-- there is nothing to carry across.

ALTER TABLE kit_items ADD COLUMN IF NOT EXISTS acquired_year integer;
ALTER TABLE kit_items DROP COLUMN IF EXISTS acquired_on;
