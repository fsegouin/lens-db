-- A lens has said for years whether it is still made, and when it stopped;
-- a camera body could not, so the page had no way to tell a reader that the
-- body they are looking at left the catalogue a decade ago. Same two columns,
-- same vocabulary (see PRODUCTION_STATUS in src/lib/vocabularies.ts).

ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "production_status" text;
ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "year_discontinued" integer;
