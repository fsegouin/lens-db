-- The straight-on cut-out the compare page draws to scale. Idempotent because
-- the journal entry is hand authored; see CLAUDE.md "Database Migrations".
ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "front_view" jsonb;
