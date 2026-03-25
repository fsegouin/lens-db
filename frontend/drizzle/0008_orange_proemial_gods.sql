CREATE TABLE "duplicate_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_entity_type" text NOT NULL,
	"source_entity_id" integer NOT NULL,
	"target_entity_type" text NOT NULL,
	"target_entity_id" integer NOT NULL,
	"reason" text,
	"flagged_by_user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by_user_id" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "merged_into_id" integer;--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "merged_into_id" integer;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_flagged_by_user_id_users_id_fk" FOREIGN KEY ("flagged_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_duplicate_flags_status" ON "duplicate_flags" USING btree ("status");