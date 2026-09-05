-- Record whether a watched listing came from a pool we could see all of.
--
-- The disappearance diff only means anything when the search covered the
-- entity's whole pool: past that, a listing can be missing from our slice
-- while still being live. Rows from a complete pool therefore need no timer
-- sweep at all, because the next weekly sweep will notice they have gone.
--
-- Without this distinction the timer treats all 30,073 pending rows alike and
-- spends the entire daily resolve budget re-checking listings that are still
-- active. About 88% of entities have a pool small enough for the diff to work,
-- so that is roughly ten days of budget spent learning nothing.
--
-- Left NULL on existing rows, which the resolve pass reads as "not known to
-- need a timer" and skips. The next sweep of each entity fills it in.

ALTER TABLE "ebay_listing_watch"
  ADD COLUMN IF NOT EXISTS "pool_complete" boolean;
--> statement-breakpoint

-- The timer queue now selects on this, so it belongs in the partial index.
DROP INDEX IF EXISTS "idx_ebay_watch_pending";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_ebay_watch_timer"
  ON "ebay_listing_watch" ("last_checked_at", "first_seen_at")
  WHERE "resolution" IS NULL AND "disappeared_at" IS NULL AND "pool_complete" = false;
