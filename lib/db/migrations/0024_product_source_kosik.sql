-- Adds Košík.cz, the second online-only retailer, as an external price source (docs/01_CURRENT_STATE.md
-- section 15). Both statements are safe to re-run. Like Rohlík it has no physical branches, so the
-- chain row is marked online (migration 0023) and none is invented; the price ingestion attributes
-- prices to a `stores` row and the seed script has no entry for it.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'kosik';--> statement-breakpoint
INSERT INTO "stores" ("chain", "is_online") VALUES ('Košík', true) ON CONFLICT ("chain") DO NOTHING;
