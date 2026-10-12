-- The household's wanted stock of a pantry row: a minimum (restock when the stock nears it) and a
-- maximum (how much to stock up to), in the row's own unit. Both nullable and additive: a row
-- without levels behaves exactly as before. Both set or both empty, 0 <= min < max.
ALTER TABLE "pantry_items" ADD COLUMN IF NOT EXISTS "min_quantity" numeric(10, 3);
ALTER TABLE "pantry_items" ADD COLUMN IF NOT EXISTS "max_quantity" numeric(10, 3);
ALTER TABLE "pantry_items" DROP CONSTRAINT IF EXISTS "pantry_items_stock_levels_check";
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_stock_levels_check"
  CHECK (("min_quantity" IS NULL AND "max_quantity" IS NULL) OR ("min_quantity" >= 0 AND "max_quantity" > "min_quantity"));
