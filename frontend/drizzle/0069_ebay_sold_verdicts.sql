-- Audit log for the sold-listing classifier: every verdict, not just the
-- accepted ones. Written idempotently because the journal entry is hand
-- authored and this may be replayed against a database that already has it.
CREATE TABLE IF NOT EXISTS "ebay_sold_verdicts" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"listing_key" text NOT NULL,
	"model" text NOT NULL,
	"title" text NOT NULL,
	"price_usd" integer,
	"sale_date" date,
	"condition" text,
	"is_relevant" boolean NOT NULL,
	"grade" text,
	"judged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ebay_sold_verdicts" ADD CONSTRAINT "uq_ebay_sold_verdict" UNIQUE("entity_type","entity_id","listing_key","model");
EXCEPTION
	WHEN duplicate_table THEN NULL;
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ebay_sold_verdicts_entity" ON "ebay_sold_verdicts" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ebay_sold_verdicts_judged_at" ON "ebay_sold_verdicts" USING btree ("judged_at");
