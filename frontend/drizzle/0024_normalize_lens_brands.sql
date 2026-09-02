-- Brand is free text, and the same maker is stored several ways: a trailing
-- space on "Vivitar " (189 lenses), all-caps variants, and bracket notation
-- like "Sigma[-Z]". Each pair slugifies to one value, so brand pages would
-- otherwise collide. Every rewrite below joins two spellings of one maker; no
-- distinct brand is merged into another.
--
-- Safe to rerun: each statement matches only the spelling it replaces.

UPDATE lenses SET brand = trim(brand) WHERE brand <> trim(brand);

UPDATE lenses SET brand = 'Mir'       WHERE brand = 'MIR';
UPDATE lenses SET brand = 'Lentar'    WHERE brand = 'LENTAR';
UPDATE lenses SET brand = 'Orion-15'  WHERE brand = 'ORION-15';
UPDATE lenses SET brand = 'Russar'    WHERE brand = 'RUSSAR';
UPDATE lenses SET brand = 'Sigma-Z'   WHERE brand = 'Sigma[-Z]';
UPDATE lenses SET brand = 'Sigma-XQ'  WHERE brand = 'Sigma[-XQ]';

-- Scrape artefacts: section headings from the source site captured as brands,
-- one lens each. Nulled rather than deleted, so the lens rows survive for
-- review; a null brand simply drops out of the brand index.
UPDATE lenses SET brand = NULL
WHERE brand IN ('Fixed-lens', 'Genres', 'Konverter', 'Limitation', 'Links');
