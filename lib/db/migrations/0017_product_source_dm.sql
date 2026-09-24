-- Adds dm drogerie markt as an external price source (docs/01_CURRENT_STATE.md section 15, fourth
-- connector). Both statements are safe to re-run.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'dm';--> statement-breakpoint
-- The ingestion attributes prices to a `stores` chain row (getStoreIdByChain), and `stores` is
-- otherwise filled by the seed script from the store fixtures, which has no dm entry. A chain row
-- alone shows nothing in the store directory (that lists branches), so this only enables prices.
INSERT INTO "stores" ("chain") VALUES ('dm') ON CONFLICT ("chain") DO NOTHING;
