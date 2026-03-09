ALTER TABLE "cameras" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cameras" ADD COLUMN "submitted_by_ip" text;--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lenses" ADD COLUMN "submitted_by_ip" text;