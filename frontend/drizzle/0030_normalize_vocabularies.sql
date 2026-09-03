-- Settle the four lens columns that are filtered with exact equality.
--
-- Every extra spelling is a filter that silently returns nothing. The Medium
-- Format option in the lens filter matched no lens at all, because the option
-- sends 'medium-format' and every medium format lens was recorded with a
-- capital F. "coverage" had reached 17 spellings for six concepts.
--
-- Two columns had also collected values belonging elsewhere: 63 lenses carry
-- an era in production_status, and one carries a list of mounts in coverage.
-- Values that cannot be mapped become null rather than a new spelling. A
-- scrape artifact like 'Announced in March 1973' can never be a facet, and the
-- year it holds is already in year_introduced, so dropping it loses nothing.
--
-- The mapping matches src/lib/vocabularies.ts, which now normalises writes
-- from the importer and reads from the filter, so this does not drift back.

-- An era recorded as a production status belongs in the era column, but only
-- where era has nothing to say. Do this before production_status is cleaned,
-- or the value is gone before it can be moved.
UPDATE lenses
SET era = production_status
WHERE production_status IN ('Film era', 'Digital era')
  AND era IS NULL;

-- coverage: 17 spellings for six concepts. Four Thirds and Micro Four Thirds
-- cover the same sensor, and coverage is an image circle rather than a mount,
-- so they share the slug the importer and the filter already use.
UPDATE lenses SET coverage = 'full-frame'
WHERE coverage IS NOT NULL
  AND coverage <> 'full-frame'
  AND (lower(coverage) LIKE '%35mm%' OR lower(coverage) LIKE '%full frame%');

UPDATE lenses SET coverage = 'aps-c'
WHERE coverage IS NOT NULL AND coverage <> 'aps-c' AND lower(coverage) LIKE '%aps-c%';

UPDATE lenses SET coverage = 'micro-four-thirds'
WHERE coverage IS NOT NULL
  AND coverage <> 'micro-four-thirds'
  AND coverage NOT LIKE '%,%'
  AND (lower(replace(coverage, '-', ' ')) LIKE '%four third%'
       OR lower(coverage) LIKE '%fourthirds%');

UPDATE lenses SET coverage = 'medium-format'
WHERE coverage IS NOT NULL
  AND coverage <> 'medium-format'
  AND lower(replace(coverage, '-', ' ')) LIKE '%medium format%';

UPDATE lenses SET coverage = 'one-inch'
WHERE coverage IN ('1', '1-inch', '1 inch');

-- A list of mounts written into the coverage column says nothing about the
-- image circle, and lens_systems already records the mounts.
UPDATE lenses SET coverage = NULL
WHERE coverage IS NOT NULL AND coverage LIKE '%,%';

UPDATE lenses SET coverage = NULL
WHERE coverage IS NOT NULL
  AND coverage NOT IN ('full-frame', 'aps-c', 'micro-four-thirds', 'medium-format', 'one-inch');

-- era: two real values, plus a product tier and six announcement strings.
UPDATE lenses SET era = 'Film era'
WHERE era IS NOT NULL AND era <> 'Film era'
  AND (lower(era) LIKE 'film%' OR lower(era) = 'vintage');

UPDATE lenses SET era = 'Digital era'
WHERE era IS NOT NULL AND era <> 'Digital era' AND lower(era) LIKE 'digital%';

UPDATE lenses SET era = NULL
WHERE era IS NOT NULL AND era NOT IN ('Film era', 'Digital era');

-- production_status: 'Discontinued (Canon EF-M, Canon RF)' says which mounts
-- went, which lens_systems already records. Keep the status, drop the aside.
UPDATE lenses
SET production_status = btrim(regexp_replace(production_status, '\s*\([^)]*\)\s*$', ''))
WHERE production_status IS NOT NULL AND production_status LIKE '%(%';

UPDATE lenses SET production_status = 'Discontinued'
WHERE production_status IS NOT NULL
  AND production_status <> 'Discontinued'
  AND lower(production_status) = 'discontinued';

UPDATE lenses SET production_status = NULL
WHERE production_status IS NOT NULL
  AND production_status NOT IN
    ('In production', 'Discontinued', 'Not yet in production', 'Collectible');

-- lens_type is an open taxonomy, so only casing and number are settled here.
UPDATE lenses SET lens_type = 'Teleconverter' WHERE lower(lens_type) = 'teleconverter';
UPDATE lenses SET lens_type = 'Accessory' WHERE lower(lens_type) = 'accessory';
UPDATE lenses SET lens_type = 'Body cap lens' WHERE lower(lens_type) = 'body cap lenses';
UPDATE lenses SET lens_type = 'Wide-angle prime lens' WHERE lower(lens_type) = 'wide angle prime';
