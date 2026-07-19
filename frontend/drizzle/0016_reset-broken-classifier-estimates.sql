-- Custom SQL migration file, put your code below! --

-- Data-only migration: reset extracted_at for price_estimates rows touched by
-- the broken LLM classifier (dead model) between 2026-07-10 and now.
-- Those scrapes stored no price_history data but still refreshed extracted_at,
-- rotating the entities out of the scrape queue. Setting extracted_at to the
-- epoch sentinel puts them at the FRONT of the rotation (batch query orders by
-- extracted_at ASC NULLS FIRST; the column is NOT NULL, so an old timestamp is
-- the sentinel rather than NULL).
--
-- Idempotent: rows updated to the 1970 sentinel no longer match the window
-- predicate, and entities that DID gain price_history in the window are
-- excluded, so re-running is a no-op.
UPDATE "price_estimates" pe
SET "extracted_at" = '1970-01-01T00:00:00Z'
WHERE pe."extracted_at" >= '2026-07-10T00:00:00Z'
  AND pe."extracted_at" <= now()
  AND NOT EXISTS (
    SELECT 1
    FROM "price_history" ph
    WHERE ph."entity_type" = pe."entity_type"
      AND ph."entity_id" = pe."entity_id"
      AND ph."extracted_at" >= '2026-07-10T00:00:00Z'
  );
