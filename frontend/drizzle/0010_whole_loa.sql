CREATE TABLE IF NOT EXISTS "lens_tags" (
	"lens_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "lens_tags_lens_id_tag_id_pk" PRIMARY KEY("lens_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"source_url" text,
	"source_name" text,
	"price_average_low" integer,
	"price_average_high" integer,
	"price_very_good_low" integer,
	"price_very_good_high" integer,
	"price_mint_low" integer,
	"price_mint_high" integer,
	"currency" text DEFAULT 'USD',
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_price_estimates_entity" UNIQUE("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"sale_date" date,
	"condition" text,
	"price_usd" integer,
	"source" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lens_tags" ADD CONSTRAINT "lens_tags_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lens_tags" ADD CONSTRAINT "lens_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lens_tags_tag" ON "lens_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lens_tags_lens" ON "lens_tags" USING btree ("lens_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_estimates_entity" ON "price_estimates" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_price_history_entity" ON "price_history" USING btree ("entity_type","entity_id");
