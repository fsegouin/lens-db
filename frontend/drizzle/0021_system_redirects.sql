CREATE TABLE "system_redirects" (
	"old_slug" text PRIMARY KEY NOT NULL,
	"system_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "system_redirects" ADD CONSTRAINT "system_redirects_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;