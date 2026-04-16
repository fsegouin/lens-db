-- Unify APS-C system variants into their full-frame parent systems.
-- Add a "coverage" column to lenses to track image circle size independently.
-- System names verified against production database on 2026-04-16.

BEGIN;

-- 1. Add coverage column to lenses
ALTER TABLE lenses ADD COLUMN IF NOT EXISTS coverage text;

-- 2. Tag lenses in APS-C-specific systems BEFORE merging
-- (a) Lenses in systems that will be merged into a parent
UPDATE lenses SET coverage = 'aps-c'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Canon EF-S', 'Canon RF-S',
    'Nikon Z APS-C', 'Nikon F APS-C',
    'Sony E APS-C', 'Sony A APS-C',
    'Pentax K APS-C', 'Sigma SA APS-C',
    'Leica L APS-C', 'Konica Minolta A APS-C'
  )
);

-- (b) Lenses in APS-C-only systems (no FF parent — these systems stay)
UPDATE lenses SET coverage = 'aps-c'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Fujifilm X', 'Canon EF-M',
    'Samsung NX', 'Samsung NX-M'
  )
);

-- (c) Micro Four Thirds lenses get their own coverage value
UPDATE lenses SET coverage = 'micro-four-thirds'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Micro Four Thirds', 'Four Thirds'
  )
);

-- 3. Reassign lenses from APS-C systems to parent systems
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Canon EF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon EF-S');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Canon RF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon RF-S');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Nikon Z')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon Z APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Nikon F')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon F APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Sony E')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony E APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony A APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Pentax K')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Pentax K APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Sigma SA')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sigma SA APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Leica L')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Leica L APS-C');

UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Konica Minolta A APS-C');

-- 4. Reassign cameras from APS-C systems to parent systems
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Canon EF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon EF-S');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Canon RF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon RF-S');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Nikon Z')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon Z APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Nikon F')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon F APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Sony E')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony E APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony A APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Pentax K')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Pentax K APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Sigma SA')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sigma SA APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Leica L')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Leica L APS-C');

UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Konica Minolta A APS-C');

-- 5. Merge view counts into parent systems
UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Canon EF-S'), 0)
WHERE name = 'Canon EF';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Canon RF-S'), 0)
WHERE name = 'Canon RF';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Nikon Z APS-C'), 0)
WHERE name = 'Nikon Z';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Nikon F APS-C'), 0)
WHERE name = 'Nikon F';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Sony E APS-C'), 0)
WHERE name = 'Sony E';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Sony A APS-C'), 0)
  + COALESCE((SELECT view_count FROM systems WHERE name = 'Konica Minolta A APS-C'), 0)
WHERE name = 'Minolta/Sony A';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Pentax K APS-C'), 0)
WHERE name = 'Pentax K';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Sigma SA APS-C'), 0)
WHERE name = 'Sigma SA';

UPDATE systems SET view_count = view_count + COALESCE(
  (SELECT view_count FROM systems WHERE name = 'Leica L APS-C'), 0)
WHERE name = 'Leica L';

-- 6. Delete the now-empty APS-C system entries
DELETE FROM systems WHERE name IN (
  'Canon EF-S', 'Canon RF-S',
  'Nikon Z APS-C', 'Nikon F APS-C',
  'Sony E APS-C', 'Sony A APS-C',
  'Pentax K APS-C', 'Sigma SA APS-C',
  'Leica L APS-C', 'Konica Minolta A APS-C'
);

COMMIT;
