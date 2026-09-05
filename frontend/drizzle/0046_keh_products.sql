-- KEH's used-lens catalogue, mirrored locally.
--
-- Mirrored rather than queried per lens because the source charges per call.
-- The whole lens catalogue is ~4,700 products over 47 pages, so a sweep costs
-- 47 credits against a 300/month allowance and every match afterwards is free
-- and offline. Searching per lens would cost ~9,300 credits a sweep.

CREATE TABLE IF NOT EXISTS "keh_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "keh_id" text NOT NULL,
  "title" text NOT NULL,
  "url" text,
  "manufacturer" text,
  "system" text,
  "product_type" text,
  "min_price_usd" integer,
  "max_price_usd" integer,
  "quantity_available" integer,
  "grades" jsonb DEFAULT '[]'::jsonb,
  "entity_type" text,
  "entity_id" integer,
  "match_state" text,
  "matched_at" timestamp with time zone,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- KEH's own product id is the stable key across sweeps, so a re-run updates
-- prices and stock in place rather than duplicating the catalogue.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_keh_products_keh_id"
  ON "keh_products" ("keh_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_keh_products_entity"
  ON "keh_products" ("entity_type", "entity_id");
--> statement-breakpoint

-- The matcher's queue. Partial so it stays small as products are examined:
-- once a product is matched, or found to belong to no lens we hold, it leaves
-- the index and is never reconsidered.
CREATE INDEX IF NOT EXISTS "idx_keh_products_unmatched"
  ON "keh_products" ("id")
  WHERE "match_state" IS NULL;
