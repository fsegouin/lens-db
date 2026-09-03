-- A fixed-lens camera has no mount, and every lens/camera relation on this
-- site is derived from a shared system_id. Before this column the only ways to
-- record one were to leave system_id null (47 bodies, whose pages then showed
-- no mount and no lens at all), to invent a one-camera "system" to host it, or
-- to borrow the mount of an interchangeable sibling the body does not accept.
-- Point the body at the lenses row for its non-removable lens instead.

ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "built_in_lens_id" integer;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cameras_built_in_lens_id_lenses_id_fk'
  ) THEN
    ALTER TABLE "cameras"
      ADD CONSTRAINT "cameras_built_in_lens_id_lenses_id_fk"
      FOREIGN KEY ("built_in_lens_id") REFERENCES "lenses"("id");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_cameras_built_in_lens" ON "cameras" ("built_in_lens_id");
