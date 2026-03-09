CREATE TABLE "camera_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"camera_id" integer NOT NULL,
	"ip_hash" text NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_camera_ratings_camera_ip" UNIQUE("camera_id","ip_hash"),
	CONSTRAINT "chk_camera_rating_range" CHECK ("camera_ratings"."rating" >= 1 AND "camera_ratings"."rating" <= 10)
);
--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "average_rating" real;--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "rating_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "camera_ratings" ADD CONSTRAINT "camera_ratings_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_camera_ratings_camera" ON "camera_ratings" USING btree ("camera_id");