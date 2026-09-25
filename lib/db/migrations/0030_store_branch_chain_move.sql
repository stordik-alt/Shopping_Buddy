-- Lets a branch move to another chain of the same retailer — Albert's hypermarkets move from "Albert"
-- to "Albert Hypermarket" (lib/stores/albert-formats.ts) — by making the two composite foreign keys
-- (store_location_id, store_id) cascade on update: when store_locations.store_id changes, the
-- branch's member_stores and deals rows follow in the same statement instead of blocking it.
-- member_stores' constraint name is 63 characters long, so Postgres stored it truncated; the
-- truncated name is used here as it is in the database.
ALTER TABLE "deals" DROP CONSTRAINT "deals_store_location_id_store_id_store_locations_id_store_id_fk";
--> statement-breakpoint
ALTER TABLE "member_stores" DROP CONSTRAINT "member_stores_store_location_id_store_id_store_locations_id_sto";
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_location_id_store_id_store_locations_id_store_id_fk" FOREIGN KEY ("store_location_id","store_id") REFERENCES "public"."store_locations"("id","store_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "member_stores" ADD CONSTRAINT "member_stores_store_location_id_store_id_store_locations_id_sto" FOREIGN KEY ("store_location_id","store_id") REFERENCES "public"."store_locations"("id","store_id") ON DELETE cascade ON UPDATE cascade;
