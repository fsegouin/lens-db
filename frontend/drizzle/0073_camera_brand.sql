-- Cameras get the brand column lenses have always had. Until now a camera's
-- maker lived only in its name, so nothing could list cameras by brand or
-- hand one out as a make and a model. Filled by
-- scripts/assign-camera-brands.mjs. Idempotent because the journal entry is
-- hand authored; see CLAUDE.md "Database Migrations".
ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "brand" text;
