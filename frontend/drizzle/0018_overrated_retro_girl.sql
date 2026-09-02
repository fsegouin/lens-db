CREATE TABLE "lens_systems" (
	"lens_id" integer NOT NULL,
	"system_id" integer NOT NULL,
	CONSTRAINT "lens_systems_lens_id_system_id_pk" PRIMARY KEY("lens_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "lens_version_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "version_group_id" integer;--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "version_label" text;--> statement-breakpoint
ALTER TABLE "lens_systems" ADD CONSTRAINT "lens_systems_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_systems" ADD CONSTRAINT "lens_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lens_systems_system" ON "lens_systems" USING btree ("system_id");--> statement-breakpoint
ALTER TABLE "lenses" ADD CONSTRAINT "lenses_version_group_id_lens_version_groups_id_fk" FOREIGN KEY ("version_group_id") REFERENCES "public"."lens_version_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_lenses_version_group" ON "lenses" USING btree ("version_group_id");