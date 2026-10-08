-- Persist explicit manual autocomplete selections without creating catalog entities.
ALTER TABLE "pantry_items" ADD COLUMN IF NOT EXISTS "product_type_id" uuid REFERENCES "product_types"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "pantry_items_product_type_idx" ON "pantry_items" ("household_id", "product_type_id");

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "product_type_id" uuid REFERENCES "product_types"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "expenses_product_idx" ON "expenses" ("household_id", "product_id");
CREATE INDEX IF NOT EXISTS "expenses_product_type_idx" ON "expenses" ("household_id", "product_type_id");
