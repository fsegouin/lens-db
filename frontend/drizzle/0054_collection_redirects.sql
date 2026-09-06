-- Somewhere for a merged-away collection's slug to point.
--
-- Nine of the fifty imported collections pair up as duplicates across two
-- naming conventions, and merging them means deleting the losing row. Today
-- that produces a hard 404: /collections/[slug] calls notFound() on a miss,
-- and every collection slug is in the sitemap and linked from each of its
-- member lens pages.
--
-- Modelled on system_redirects (migration 0021), which exists for exactly this
-- reason after the mount consolidation, and consumed the same way: the page
-- looks the slug up here before giving up.
--
-- Idempotent: the table and its constraint are both created only if absent.

CREATE TABLE IF NOT EXISTS "collection_redirects" (
	"old_slug" text PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'collection_redirects'::regclass
      AND conname = 'collection_redirects_collection_id_collections_id_fk'
  ) THEN
    ALTER TABLE "collection_redirects"
      ADD CONSTRAINT "collection_redirects_collection_id_collections_id_fk"
      FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
