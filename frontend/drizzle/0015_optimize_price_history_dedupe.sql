-- Remove duplicate rows that share (entity_type, entity_id, source_url),
-- keeping the lowest id, so the partial unique index can be created.
DELETE FROM price_history
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY entity_type, entity_id, source_url
      ORDER BY id
    ) AS rn
    FROM price_history
    WHERE source_url IS NOT NULL
  ) t
  WHERE t.rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_price_history_entity_source_url" ON "price_history" USING btree ("entity_type","entity_id","source_url") WHERE source_url IS NOT NULL;
