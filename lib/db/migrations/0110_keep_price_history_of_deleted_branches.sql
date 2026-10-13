-- Deleting a branch must not erase its price history (docs/35_SECURITY_AUDIT.md, S17; CLAUDE.md section 16: price
-- history is never silently overwritten or lost). The foreign keys from prices and deals to store_locations were
-- ON DELETE CASCADE, so removing one branch row deleted every price and promotion ever recorded for it. They become
-- ON DELETE RESTRICT: the database refuses to delete a branch that still has prices or deals. Favourite branches
-- (member_stores) and the nullable references of purchases, receipts and list items are unchanged.
-- Nothing in the application deletes branches; the store sync only inserts and updates them.
ALTER TABLE "prices" DROP CONSTRAINT IF EXISTS "prices_store_location_id_store_locations_id_fk";--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_store_location_id_store_locations_id_fk" FOREIGN KEY ("store_location_id") REFERENCES "store_locations"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_store_location_id_store_locations_id_fk";--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_location_id_store_locations_id_fk" FOREIGN KEY ("store_location_id") REFERENCES "store_locations"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_store_location_id_store_id_store_locations_id_store_id_fk";--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_store_location_id_store_id_store_locations_id_store_id_fk" FOREIGN KEY ("store_location_id", "store_id") REFERENCES "store_locations"("id", "store_id") ON UPDATE CASCADE ON DELETE RESTRICT;
