-- Adds Teta drogerie as an external price source (docs/42_TETA_DATA_SOURCE_AUDIT.md). The online
-- catalog is read from Teta's public pages; the import writes prices, packages and trade items.
-- Both statements are safe to re-run.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'teta';--> statement-breakpoint
-- The ingestion attributes prices to a `stores` chain row (getStoreIdByChain), and `stores` is
-- otherwise filled by the seed script from the store fixtures, which has no Teta entry. Teta has
-- physical branches in the world, but the app knows none of them, so this chain row carries no
-- branch: its prices are chain-wide (CHAIN scope, store_location_id = NULL) and no branch is
-- invented (CLAUDE.md section 14).
INSERT INTO "stores" ("chain") VALUES ('Teta') ON CONFLICT ("chain") DO NOTHING;
