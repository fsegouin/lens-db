-- Shutter type and shutter control become two columns with closed
-- vocabularies (src/lib/shutter.ts). Idempotent because the journal entry is
-- hand authored; see CLAUDE.md "Database Migrations".
ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "shutter_control" text;
--> statement-breakpoint

-- 260 rows held a speed range ("1/30 - 1/250 sec") as their shutter type. Every
-- one already has the same value in specs.Speeds; copy it first for any that
-- does not, then clear it from the type.
UPDATE "cameras"
SET "specs" = COALESCE("specs", '{}'::jsonb) || jsonb_build_object('Speeds', "shutter_type")
WHERE "shutter_type" ~ '^[0-9]' AND COALESCE("specs"->>'Speeds', '') = '';
--> statement-breakpoint
UPDATE "cameras" SET "shutter_type" = NULL WHERE "shutter_type" ~ '^[0-9]';
--> statement-breakpoint

-- "Electronic" was written on twelve film bodies, where it describes how the
-- shutter is timed, not what it is.
UPDATE "cameras"
SET "shutter_control" = COALESCE("shutter_control", 'Electronically controlled'),
    "shutter_type" = NULL
WHERE "shutter_type" = 'Electronic' AND "megapixels" IS NULL;
--> statement-breakpoint

UPDATE "cameras" SET "shutter_type" = 'Leaf' WHERE "shutter_type" = 'Leaf shutter';
--> statement-breakpoint
UPDATE "cameras" SET "shutter_type" = 'In-lens leaf' WHERE "shutter_type" = 'In-lens leaf shutter';
--> statement-breakpoint

-- The lens-db.com import recorded the mechanism in specs.Type and the control
-- in specs.Model, and the columns were never filled from them.
UPDATE "cameras"
SET "shutter_type" = CASE lower(trim("specs"->>'Type'))
    WHEN 'focal-plane' THEN 'Focal-plane'
    WHEN 'in-lens leaf shutter' THEN 'In-lens leaf'
    WHEN 'leaf shutter' THEN 'Leaf'
  END
WHERE "shutter_type" IS NULL
  AND lower(trim("specs"->>'Type')) IN ('focal-plane', 'in-lens leaf shutter', 'leaf shutter');
--> statement-breakpoint
UPDATE "cameras"
SET "shutter_control" = CASE
    WHEN "specs"->>'Model' ~* '^mechanical' THEN 'Mechanical'
    ELSE 'Electronically controlled'
  END
WHERE "shutter_control" IS NULL
  AND "specs"->>'Model' ~* '^(mechanical|electronically controlled)';
--> statement-breakpoint

-- Bodies whose fast speeds are timed mechanically and run without a battery
-- while the slow ones are timed electronically.
UPDATE "cameras"
SET "shutter_control" = 'Hybrid',
    "shutter_type" = COALESCE("shutter_type", 'Focal-plane')
WHERE "slug" IN (
  'canon-ef-1973',
  'nikon-fm3a-2001',
  'pentax-lx-1980',
  'pentax-lx-gold-1981',
  'pentax-lx-titan-1994',
  'pentax-lx-limited-1996',
  'pentax-lx-2000-2000'
);
