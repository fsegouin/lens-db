-- Schema change: add "coverage" column to track image circle size.
-- Also bundles two historical data migrations that were never registered in
-- the drizzle journal: the Canon EOS→mount merge and the APS-C→parent-system
-- unification (plus a coverage backfill). All data steps are written to be
-- idempotent so running against any partial prior state is safe.

ALTER TABLE "lenses" ADD COLUMN IF NOT EXISTS "coverage" text;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Canon EOS → mount-named systems (originally in 0010_merge_canon_eos_into_mounts.sql)
-- ---------------------------------------------------------------------------
-- Reassign lenses and cameras from EOS entries to mount entries.
-- Hardcoded IDs come from production; if the EOS rows are already gone these
-- UPDATEs match nothing and are no-ops.

UPDATE cameras SET system_id = 119 WHERE system_id = 143;
--> statement-breakpoint
UPDATE cameras SET system_id = 108 WHERE system_id = 142;
--> statement-breakpoint
UPDATE cameras SET system_id = 87  WHERE system_id = 144;
--> statement-breakpoint
UPDATE lenses  SET system_id = 87  WHERE system_id = 144;
--> statement-breakpoint
UPDATE cameras SET system_id = 75  WHERE system_id = 145;
--> statement-breakpoint
UPDATE lenses  SET system_id = 75  WHERE system_id = 145;
--> statement-breakpoint
UPDATE cameras SET system_id = 417 WHERE system_id = 375;
--> statement-breakpoint
UPDATE lenses  SET system_id = 417 WHERE system_id = 375;
--> statement-breakpoint

-- Merge view counts; COALESCE guards against the source row already being gone.
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE id = 143), 0) WHERE id = 119;
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE id = 142), 0) WHERE id = 108;
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE id = 144), 0) WHERE id = 87;
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE id = 145), 0) WHERE id = 75;
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE id = 375), 0) WHERE id = 417;
--> statement-breakpoint

DELETE FROM systems WHERE id IN (143, 142, 144, 145, 375);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- APS-C system unification + coverage backfill (originally in 0012_unify_apsc_systems.sql)
-- ---------------------------------------------------------------------------

-- 1. Tag lenses in APS-C-specific systems BEFORE merging.
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
--> statement-breakpoint

UPDATE lenses SET coverage = 'aps-c'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Fujifilm X', 'Canon EF-M',
    'Samsung NX', 'Samsung NX-M'
  )
);
--> statement-breakpoint

UPDATE lenses SET coverage = 'micro-four-thirds'
WHERE system_id IN (
  SELECT id FROM systems WHERE name IN (
    'Micro Four Thirds', 'Four Thirds'
  )
);
--> statement-breakpoint

-- 2. Reassign lenses from APS-C systems to parent systems.
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Canon EF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon EF-S');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Canon RF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon RF-S');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Nikon Z')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon Z APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Nikon F')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon F APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Sony E')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony E APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony A APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Pentax K')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Pentax K APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Sigma SA')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sigma SA APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Leica L')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Leica L APS-C');
--> statement-breakpoint
UPDATE lenses SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Konica Minolta A APS-C');
--> statement-breakpoint

-- 3. Reassign cameras from APS-C systems to parent systems.
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Canon EF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon EF-S');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Canon RF')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Canon RF-S');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Nikon Z')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon Z APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Nikon F')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Nikon F APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Sony E')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony E APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sony A APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Pentax K')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Pentax K APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Sigma SA')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Sigma SA APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Leica L')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Leica L APS-C');
--> statement-breakpoint
UPDATE cameras SET system_id = (SELECT id FROM systems WHERE name = 'Minolta/Sony A')
WHERE system_id = (SELECT id FROM systems WHERE name = 'Konica Minolta A APS-C');
--> statement-breakpoint

-- 4. Merge view counts into parent systems.
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Canon EF-S'), 0)
WHERE name = 'Canon EF';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Canon RF-S'), 0)
WHERE name = 'Canon RF';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Nikon Z APS-C'), 0)
WHERE name = 'Nikon Z';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Nikon F APS-C'), 0)
WHERE name = 'Nikon F';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Sony E APS-C'), 0)
WHERE name = 'Sony E';
--> statement-breakpoint
UPDATE systems SET view_count = view_count
  + COALESCE((SELECT view_count FROM systems WHERE name = 'Sony A APS-C'), 0)
  + COALESCE((SELECT view_count FROM systems WHERE name = 'Konica Minolta A APS-C'), 0)
WHERE name = 'Minolta/Sony A';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Pentax K APS-C'), 0)
WHERE name = 'Pentax K';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Sigma SA APS-C'), 0)
WHERE name = 'Sigma SA';
--> statement-breakpoint
UPDATE systems SET view_count = view_count + COALESCE((SELECT view_count FROM systems WHERE name = 'Leica L APS-C'), 0)
WHERE name = 'Leica L';
--> statement-breakpoint

-- 5. Delete the now-empty APS-C system entries.
DELETE FROM systems WHERE name IN (
  'Canon EF-S', 'Canon RF-S',
  'Nikon Z APS-C', 'Nikon F APS-C',
  'Sony E APS-C', 'Sony A APS-C',
  'Pentax K APS-C', 'Sigma SA APS-C',
  'Leica L APS-C', 'Konica Minolta A APS-C'
);
