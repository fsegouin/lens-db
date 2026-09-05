-- Remember what the classifier decided about a listing.
--
-- The ingest re-samples the same entity every sweep and eBay listings live for
-- weeks, so the same listing is currently sent to the model six or more times
-- over its life and judged identically each time. At ~1,500 classifier calls
-- per run that is the largest avoidable cost in the pipeline.
--
-- Keyed per entity because relevance is a question about a pairing: the same
-- listing can be the right lens for one record and the wrong one for its near
-- neighbour.

CREATE TABLE IF NOT EXISTS "ebay_listing_verdicts" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "legacy_item_id" text NOT NULL,
  "is_relevant" boolean NOT NULL,
  "grade" text,
  "judged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ebay_verdict_entity_item"
  ON "ebay_listing_verdicts" ("entity_type", "entity_id", "legacy_item_id");
--> statement-breakpoint

-- Retention. A verdict outlives the listing it describes and is dead weight
-- once that listing is gone, so the ingest prunes by age.
CREATE INDEX IF NOT EXISTS "idx_ebay_verdicts_judged_at"
  ON "ebay_listing_verdicts" ("judged_at");
--> statement-breakpoint

-- Seed from what we already know. Every watched listing carries a grade the
-- classifier produced and was only recorded because it was judged relevant,
-- so those verdicts are recoverable rather than needing to be bought again.
INSERT INTO "ebay_listing_verdicts"
  ("entity_type", "entity_id", "legacy_item_id", "is_relevant", "grade", "judged_at")
SELECT "entity_type", "entity_id", "legacy_item_id", true, "condition", "first_seen_at"
FROM "ebay_listing_watch"
ON CONFLICT ("entity_type", "entity_id", "legacy_item_id") DO NOTHING;
