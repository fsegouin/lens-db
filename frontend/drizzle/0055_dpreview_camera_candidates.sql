-- The seen-registry for the DPReview camera-body watcher.
--
-- Mirrors dpreview_lens_candidates, which has served the lens half of the
-- watcher since migration 0019. Two tables rather than one table with an
-- entity_type discriminator: the candidate rows point at different entity
-- tables (cameras vs lenses), and a shared unique index on dpreview_slug
-- would make a camera and a lens that happen to share a DPReview slug
-- collide over nothing.
--
-- Note the absence of a camera analogue of the lens table's "new_version"
-- verdict. Lens generations are modelled with lens_version_groups, so a
-- Type V lens joins its Type IV in a group; a camera generation (an OM-1
-- Mark II) is simply its own cameras row, and there is no camera version
-- group to join. The LLM verdict here is therefore binary: "duplicate" or
-- "new_camera".
--
-- llm_is_duplicate is deliberately not carried over: it is the deprecated
-- column the lens table still holds only because migration 0019 already
-- shipped it.
--
-- Idempotent, and safe to rerun.

CREATE TABLE IF NOT EXISTS "dpreview_camera_candidates" (
  "id" serial PRIMARY KEY NOT NULL,
  "dpreview_slug" text NOT NULL,
  "dpreview_url" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "camera_id" integer,
  "pending_edit_id" integer,
  "candidate_data" jsonb,
  "llm_verdict" text,
  "llm_confidence" real,
  "llm_reasoning" text,
  "first_seen_at" timestamp with time zone DEFAULT now(),
  "last_seen_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

-- The DPReview slug is the idempotency key: a product page already processed
-- under any status is never reprocessed.
CREATE UNIQUE INDEX IF NOT EXISTS "dpreview_camera_candidates_dpreview_slug_unique"
  ON "dpreview_camera_candidates" ("dpreview_slug");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_dpreview_camera_candidates_status"
  ON "dpreview_camera_candidates" ("status");
--> statement-breakpoint

-- Foreign keys added defensively: ADD CONSTRAINT has no IF NOT EXISTS, so a
-- rerun over a partially-applied state would abort the migration without the
-- duplicate_object guard.
DO $$ BEGIN
  ALTER TABLE "dpreview_camera_candidates"
    ADD CONSTRAINT "dpreview_camera_candidates_camera_id_cameras_id_fk"
    FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "dpreview_camera_candidates"
    ADD CONSTRAINT "dpreview_camera_candidates_pending_edit_id_pending_edits_id_fk"
    FOREIGN KEY ("pending_edit_id") REFERENCES "public"."pending_edits"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
