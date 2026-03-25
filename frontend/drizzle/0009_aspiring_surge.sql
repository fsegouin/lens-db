CREATE TABLE "pending_edits" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"summary" text NOT NULL,
	"user_id" integer NOT NULL,
	"ip_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "pending_edits" ADD CONSTRAINT "pending_edits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_edits" ADD CONSTRAINT "pending_edits_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pending_edits_status" ON "pending_edits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pending_edits_user" ON "pending_edits" USING btree ("user_id");