CREATE TABLE "revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"summary" text NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb,
	"user_id" integer,
	"ip_hash" text,
	"is_revert" boolean DEFAULT false,
	"reverted_to_revision" integer,
	"is_patrolled" boolean DEFAULT false,
	"patrolled_by_user_id" integer,
	"patrolled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_revision_number" UNIQUE("entity_type","entity_id","revision_number")
);
--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "protection_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "protection_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "lens_series" ADD COLUMN "protection_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "protection_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "systems" ADD COLUMN "protection_level" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_patrolled_by_user_id_users_id_fk" FOREIGN KEY ("patrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_revisions_entity" ON "revisions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_revisions_user" ON "revisions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_revisions_created" ON "revisions" USING btree ("created_at");