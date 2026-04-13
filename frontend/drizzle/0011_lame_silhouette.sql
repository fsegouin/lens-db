ALTER TABLE "price_estimates" ADD COLUMN "median_price" integer;--> statement-breakpoint
ALTER TABLE "price_estimates" ADD COLUMN "rarity" text;--> statement-breakpoint
ALTER TABLE "price_estimates" ADD COLUMN "rarity_votes" integer;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "source_url" text;