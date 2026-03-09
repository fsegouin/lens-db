CREATE TABLE "lens_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lens_series_name_unique" UNIQUE("name"),
	CONSTRAINT "lens_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lens_series_memberships" (
	"lens_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	CONSTRAINT "lens_series_memberships_lens_id_series_id_pk" PRIMARY KEY("lens_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "lens_series_memberships" ADD CONSTRAINT "lens_series_memberships_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_series_memberships" ADD CONSTRAINT "lens_series_memberships_series_id_lens_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."lens_series"("id") ON DELETE cascade ON UPDATE no action;