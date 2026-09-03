CREATE TABLE IF NOT EXISTS "kit_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition" text,
	"serial_number" text,
	"acquired_on" date,
	"acquired_price_usd" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_kit_items_user_entity" UNIQUE("user_id","entity_type","entity_id"),
	CONSTRAINT "chk_kit_quantity" CHECK ("kit_items"."quantity" >= 1 AND "kit_items"."quantity" <= 999),
	CONSTRAINT "chk_kit_entity_type" CHECK ("kit_items"."entity_type" IN ('lens', 'camera'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "handle" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kit_is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "kit_items" ADD CONSTRAINT "kit_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kit_items_user" ON "kit_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kit_items_entity" ON "kit_items" USING btree ("entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_handle_unique" UNIQUE("handle");