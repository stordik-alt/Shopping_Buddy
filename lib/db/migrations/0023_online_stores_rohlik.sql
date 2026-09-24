-- Online-only retailers (docs/01_CURRENT_STATE.md section 15): Rohlík is the first chain with no
-- physical branches. Its prices are chain-wide (CHAIN scope, which the price model already supports),
-- but a promotion (`deals`) was keyed only by a branch, which an online chain does not have.
--
-- 1. `deals.store_id`: the chain a promotion belongs to. Backfilled from the branch every existing
--    deal already has, then made NOT NULL.
-- 2. `deals.store_location_id` becomes nullable (null = the chain's deal, no branch).
-- 3. A composite foreign key keeps a named branch honest: it must belong to the deal's chain (the
--    same guard `member_stores` has). MATCH SIMPLE, so a null branch skips the check.
-- 4. `stores.is_online` marks a chain without branches; Rohlík is seeded here because the price
--    ingestion attributes prices to a `stores` row (getStoreByChain) and the seed script has no entry.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'rohlik';--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "store_id" uuid;--> statement-breakpoint
UPDATE "deals" SET "store_id" = "store_locations"."store_id" FROM "store_locations" WHERE "store_locations"."id" = "deals"."store_location_id";--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "store_location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_location_id_store_id_store_locations_id_store_id_fk" FOREIGN KEY ("store_location_id","store_id") REFERENCES "public"."store_locations"("id","store_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "stores" ("chain", "is_online") VALUES ('Rohlík', true) ON CONFLICT ("chain") DO NOTHING;
