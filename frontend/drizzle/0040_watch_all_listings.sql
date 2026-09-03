-- Resolve listings because they disappeared, not because a timer fired.
--
-- The previous shape re-checked every pending watch row on a 7-day timer.
-- At the intended watch volume that is tens of thousands of calls a day
-- against a 5,000/day quota, and almost all of them would report "still
-- active". The daily search already knows which listings stopped coming
-- back, so it can mark them and the resolve pass can spend its calls only
-- on listings that actually ended, which is exactly the set that might be
-- a sale.

ALTER TABLE "ebay_listing_watch"
  ADD COLUMN IF NOT EXISTS "last_seen_active_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "ebay_listing_watch"
  ADD COLUMN IF NOT EXISTS "disappeared_at" timestamp with time zone;
--> statement-breakpoint

-- Existing rows were all seen when they were first recorded.
UPDATE "ebay_listing_watch"
  SET "last_seen_active_at" = "first_seen_at"
  WHERE "last_seen_active_at" IS NULL;
--> statement-breakpoint

-- The resolve queue: unresolved listings that have stopped appearing,
-- longest-gone first. Partial so it stays small as rows resolve.
CREATE INDEX IF NOT EXISTS "idx_ebay_watch_disappeared"
  ON "ebay_listing_watch" ("disappeared_at")
  WHERE "resolution" IS NULL AND "disappeared_at" IS NOT NULL;
--> statement-breakpoint

-- Used by the ingest pass to find this entity's rows that today's search
-- did not return, and by pruning to drop long-dead rows.
CREATE INDEX IF NOT EXISTS "idx_ebay_watch_last_seen"
  ON "ebay_listing_watch" ("entity_type", "entity_id", "last_seen_active_at")
  WHERE "resolution" IS NULL;
