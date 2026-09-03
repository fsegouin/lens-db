-- Index for pruning asking snapshots by age.
--
-- The unique index on (entity_type, entity_id, observed_on) cannot serve a
-- plain date-range delete, because observed_on is its last column. Without
-- this, retention would sequentially scan the whole table on every ingest
-- call. With it the delete is an index range scan that usually matches
-- nothing and costs almost nothing.

CREATE INDEX IF NOT EXISTS "idx_ebay_asking_observed_on"
  ON "ebay_asking_snapshots" ("observed_on");
