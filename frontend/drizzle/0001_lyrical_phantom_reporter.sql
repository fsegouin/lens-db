CREATE TABLE "blocked_ips" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_address" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "blocked_ips_ip_address_unique" UNIQUE("ip_address")
);
--> statement-breakpoint
CREATE TABLE "camera_comparisons" (
	"id" serial PRIMARY KEY NOT NULL,
	"camera_id_1" integer NOT NULL,
	"camera_id_2" integer NOT NULL,
	"view_count" integer DEFAULT 1,
	"last_compared_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_camera_comparisons_pair" UNIQUE("camera_id_1","camera_id_2"),
	CONSTRAINT "chk_camera_order" CHECK ("camera_comparisons"."camera_id_1" < "camera_comparisons"."camera_id_2")
);
--> statement-breakpoint
ALTER TABLE "issue_reports" ADD COLUMN "entity_slug" text;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD COLUMN "field_name" text;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD COLUMN "old_value" text;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD COLUMN "suggested_value" text;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "issue_reports" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "camera_comparisons" ADD CONSTRAINT "camera_comparisons_camera_id_1_cameras_id_fk" FOREIGN KEY ("camera_id_1") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_comparisons" ADD CONSTRAINT "camera_comparisons_camera_id_2_cameras_id_fk" FOREIGN KEY ("camera_id_2") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_camera_comparisons_views" ON "camera_comparisons" USING btree ("view_count");