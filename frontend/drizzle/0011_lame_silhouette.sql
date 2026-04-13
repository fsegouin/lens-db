ALTER TABLE "price_estimates" ADD COLUMN IF NOT EXISTS "median_price" integer;--> statement-breakpoint
ALTER TABLE "price_estimates" ADD COLUMN IF NOT EXISTS "rarity" text;--> statement-breakpoint
ALTER TABLE "price_estimates" ADD COLUMN IF NOT EXISTS "rarity_votes" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN IF NOT EXISTS "source_url" text;
