CREATE TABLE "cameras" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"url" text,
	"system_id" integer,
	"description" text,
	"sensor_type" text,
	"sensor_size" text,
	"megapixels" real,
	"resolution" text,
	"year_introduced" integer,
	"body_type" text,
	"weight_g" real,
	"view_count" integer DEFAULT 0,
	"specs" jsonb DEFAULT '{}'::jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "cameras_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "collections_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "issue_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_name" text NOT NULL,
	"entity_slug" text,
	"message" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"suggested_value" text,
	"ip_address" text,
	"country" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "blocked_ips" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "blocked_ips_ip_address_unique" UNIQUE("ip_address")
);
--> statement-breakpoint
CREATE TABLE "lens_collections" (
	"lens_id" integer NOT NULL,
	"collection_id" integer NOT NULL,
	CONSTRAINT "lens_collections_lens_id_collection_id_pk" PRIMARY KEY("lens_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "lens_comparisons" (
	"id" serial PRIMARY KEY NOT NULL,
	"lens_id_1" integer NOT NULL,
	"lens_id_2" integer NOT NULL,
	"view_count" integer DEFAULT 1,
	"last_compared_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_lens_comparisons_pair" UNIQUE("lens_id_1","lens_id_2"),
	CONSTRAINT "chk_lens_order" CHECK ("lens_comparisons"."lens_id_1" < "lens_comparisons"."lens_id_2")
);
--> statement-breakpoint
CREATE TABLE "lens_compatibility" (
	"lens_id" integer NOT NULL,
	"camera_id" integer NOT NULL,
	"is_native" boolean DEFAULT true,
	"notes" text,
	CONSTRAINT "lens_compatibility_lens_id_camera_id_pk" PRIMARY KEY("lens_id","camera_id")
);
--> statement-breakpoint
CREATE TABLE "lens_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"lens_id" integer NOT NULL,
	"ip_hash" text NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_lens_ratings_lens_ip" UNIQUE("lens_id","ip_hash"),
	CONSTRAINT "chk_rating_range" CHECK ("lens_ratings"."rating" >= 1 AND "lens_ratings"."rating" <= 10)
);
--> statement-breakpoint
CREATE TABLE "lenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"url" text,
	"brand" text,
	"system_id" integer,
	"description" text,
	"lens_type" text,
	"era" text,
	"production_status" text,
	"focal_length_min" real,
	"focal_length_max" real,
	"aperture_min" real,
	"aperture_max" real,
	"weight_g" real,
	"filter_size_mm" real,
	"min_focus_distance_m" real,
	"max_magnification" real,
	"lens_elements" integer,
	"lens_groups" integer,
	"diaphragm_blades" integer,
	"year_introduced" integer,
	"year_discontinued" integer,
	"is_zoom" boolean DEFAULT false,
	"is_macro" boolean DEFAULT false,
	"is_prime" boolean DEFAULT false,
	"has_stabilization" boolean DEFAULT false,
	"has_autofocus" boolean DEFAULT false,
	"view_count" integer DEFAULT 0,
	"average_rating" real,
	"rating_count" integer DEFAULT 0,
	"specs" jsonb DEFAULT '{}'::jsonb,
	"images" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "lenses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"mount_type" text,
	"manufacturer" text,
	"view_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "systems_name_unique" UNIQUE("name"),
	CONSTRAINT "systems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_collections" ADD CONSTRAINT "lens_collections_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_collections" ADD CONSTRAINT "lens_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_comparisons" ADD CONSTRAINT "lens_comparisons_lens_id_1_lenses_id_fk" FOREIGN KEY ("lens_id_1") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_comparisons" ADD CONSTRAINT "lens_comparisons_lens_id_2_lenses_id_fk" FOREIGN KEY ("lens_id_2") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_compatibility" ADD CONSTRAINT "lens_compatibility_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_compatibility" ADD CONSTRAINT "lens_compatibility_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_ratings" ADD CONSTRAINT "lens_ratings_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lenses" ADD CONSTRAINT "lenses_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cameras_system" ON "cameras" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "idx_issue_reports_status" ON "issue_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_lens_comparisons_views" ON "lens_comparisons" USING btree ("view_count");--> statement-breakpoint
CREATE INDEX "idx_lens_ratings_lens" ON "lens_ratings" USING btree ("lens_id");--> statement-breakpoint
CREATE INDEX "idx_lenses_system" ON "lenses" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "idx_lenses_brand" ON "lenses" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "idx_lenses_focal" ON "lenses" USING btree ("focal_length_min","focal_length_max");--> statement-breakpoint
CREATE INDEX "idx_lenses_aperture" ON "lenses" USING btree ("aperture_min");--> statement-breakpoint
CREATE INDEX "idx_lenses_year" ON "lenses" USING btree ("year_introduced");