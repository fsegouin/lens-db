-- eBay pipeline rebuild: asking-price snapshots + the sold-listing watch.
--
-- Written by hand rather than generated: drizzle-kit cannot run
-- non-interactively in this repo and would emit an already-shipped rename.
-- Every statement is idempotent so a partial prior state re-runs cleanly.

CREATE TABLE IF NOT EXISTS "ebay_listing_watch" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "legacy_item_id" text NOT NULL,
  "title" text,
  "condition" text,
  "asking_price_usd" integer,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_checked_at" timestamp with time zone,
  "resolution" text,
  "sold_price_usd" integer,
  "sold_on" date
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ebay_asking_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "observed_on" date NOT NULL,
  "median_usd" integer,
  "p25_usd" integer,
  "p75_usd" integer,
  "sample_count" integer NOT NULL,
  "total_available" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- One row per (entity, listing): the same item can legitimately be watched
-- for more than one lens when names overlap.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ebay_watch_entity_item"
  ON "ebay_listing_watch" ("entity_type", "entity_id", "legacy_item_id");
--> statement-breakpoint

-- The resolve queue reads only unresolved rows, so keep the index partial.
CREATE INDEX IF NOT EXISTS "idx_ebay_watch_pending"
  ON "ebay_listing_watch" ("first_seen_at")
  WHERE "resolution" IS NULL;
--> statement-breakpoint

-- One asking observation per entity per day, which is what keeps the chart
-- to a single point per day instead of one per scrape.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ebay_asking_entity_day"
  ON "ebay_asking_snapshots" ("entity_type", "entity_id", "observed_on");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_ebay_asking_entity"
  ON "ebay_asking_snapshots" ("entity_type", "entity_id");
--> statement-breakpoint

-- Existing estimates were all built from completed sales, so "sold" is the
-- correct backfill value for every current row.
ALTER TABLE "price_estimates"
  ADD COLUMN IF NOT EXISTS "price_source" text DEFAULT 'sold' NOT NULL;
