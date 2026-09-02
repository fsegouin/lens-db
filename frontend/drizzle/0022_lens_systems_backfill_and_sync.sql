-- lens_systems becomes the source of truth for "which mounts is this lens
-- sold in". lenses.system_id stays the primary/reference mount and must
-- always appear in lens_systems too, so list/filter/system-page queries can
-- read the junction table alone without dropping legacy lenses.
--
-- 1. Backfill: every lens with a primary mount gets a junction row.
-- 2. Trigger: any later insert or change of lenses.system_id keeps the
--    junction in sync, whatever code path wrote it (admin, submissions,
--    community corrections, one-off scripts).
--
-- Idempotent: ON CONFLICT DO NOTHING, CREATE OR REPLACE, DROP IF EXISTS.

INSERT INTO lens_systems (lens_id, system_id)
SELECT id, system_id FROM lenses WHERE system_id IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lens_systems_sync_primary() RETURNS trigger AS $$
BEGIN
  IF NEW.system_id IS NOT NULL THEN
    INSERT INTO lens_systems (lens_id, system_id)
    VALUES (NEW.id, NEW.system_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_lens_systems_sync_primary ON lenses;
--> statement-breakpoint
CREATE TRIGGER trg_lens_systems_sync_primary
AFTER INSERT OR UPDATE OF system_id ON lenses
FOR EACH ROW EXECUTE FUNCTION lens_systems_sync_primary();
