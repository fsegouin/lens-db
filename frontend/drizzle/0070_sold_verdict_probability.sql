-- Confidence behind a verdict, for models that report one. Idempotent because
-- the journal entry is hand authored; see CLAUDE.md "Database Migrations".
ALTER TABLE "ebay_sold_verdicts" ADD COLUMN IF NOT EXISTS "probability" real;
