-- A published kit showed what its owner paid for every item, which the
-- roadmap said it never would. The estimate is the site's number; the price
-- paid is the owner's. It is now hidden from the public profile and from the
-- owners list on lens and camera pages unless the owner turns this on, and it
-- only ever applies on top of a kit that is already public.
--
-- Off for everyone, including people who had already published their kit.
-- They agreed to show what they own, not what they spent.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kit_shows_paid" boolean DEFAULT false NOT NULL;
