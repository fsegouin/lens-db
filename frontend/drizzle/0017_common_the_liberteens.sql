CREATE TABLE "dpreview_lens_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"dpreview_slug" text NOT NULL,
	"dpreview_url" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lens_id" integer,
	"pending_edit_id" integer,
	"candidate_data" jsonb,
	"llm_confidence" real,
	"llm_reasoning" text,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "dpreview_lens_candidates_dpreview_slug_unique" UNIQUE("dpreview_slug")
);
--> statement-breakpoint
ALTER TABLE "dpreview_lens_candidates" ADD CONSTRAINT "dpreview_lens_candidates_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpreview_lens_candidates" ADD CONSTRAINT "dpreview_lens_candidates_pending_edit_id_pending_edits_id_fk" FOREIGN KEY ("pending_edit_id") REFERENCES "public"."pending_edits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dpreview_lens_candidates_status" ON "dpreview_lens_candidates" USING btree ("status");