-- Add nullable exact-identity links to historical price/deal rows.
-- Composite foreign keys guarantee the linked trade item / retailer reference belongs to product_id.
ALTER TABLE "trade_items"
  ADD CONSTRAINT "trade_items_id_product_unique" UNIQUE ("id", "product_id");
--> statement-breakpoint
ALTER TABLE "retailer_product_refs"
  ADD CONSTRAINT "retailer_product_refs_id_product_unique" UNIQUE ("id", "product_id");
--> statement-breakpoint
ALTER TABLE "prices"
  ADD COLUMN "trade_item_id" uuid,
  ADD COLUMN "retailer_product_ref_id" uuid;
--> statement-breakpoint
ALTER TABLE "prices"
  ADD CONSTRAINT "prices_trade_item_product_fk"
  FOREIGN KEY ("trade_item_id", "product_id") REFERENCES "trade_items"("id", "product_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "prices"
  ADD CONSTRAINT "prices_retailer_ref_product_fk"
  FOREIGN KEY ("retailer_product_ref_id", "product_id") REFERENCES "retailer_product_refs"("id", "product_id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "prices_trade_item_observed_idx" ON "prices" ("trade_item_id", "observed_at");
--> statement-breakpoint
CREATE INDEX "prices_retailer_ref_observed_idx" ON "prices" ("retailer_product_ref_id", "observed_at");
--> statement-breakpoint
ALTER TABLE "deals"
  ADD COLUMN "trade_item_id" uuid,
  ADD COLUMN "retailer_product_ref_id" uuid;
--> statement-breakpoint
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_trade_item_product_fk"
  FOREIGN KEY ("trade_item_id", "product_id") REFERENCES "trade_items"("id", "product_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_retailer_ref_product_fk"
  FOREIGN KEY ("retailer_product_ref_id", "product_id") REFERENCES "retailer_product_refs"("id", "product_id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "deals_trade_item_idx" ON "deals" ("trade_item_id", "store_id");
--> statement-breakpoint
CREATE INDEX "deals_retailer_ref_idx" ON "deals" ("retailer_product_ref_id", "store_id");
