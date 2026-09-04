-- Per-field citations, stored as exceptions to the entity's own source.
--
-- The bulk import is the default provenance for almost everything here, so
-- this table records only the fields that have been sourced to something
-- else: re-checked against a manufacturer, imported from DPReview, matched to
-- Wikidata, or corrected by a person. A field with no row is, truthfully, a
-- field nobody has checked since the scrape.

CREATE TABLE IF NOT EXISTS "field_citations" (
  "id" serial PRIMARY KEY,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "field" text NOT NULL,
  "source_name" text NOT NULL,
  "source_url" text,
  "retrieved_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revision_id" integer,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_field_citations_entity"
  ON "field_citations" ("entity_type", "entity_id");

-- Re-sourcing a field replaces its citation rather than stacking another
-- beside it, so "how is this known" always has exactly one answer.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_field_citations_entity_field"
  ON "field_citations" ("entity_type", "entity_id", "field");
