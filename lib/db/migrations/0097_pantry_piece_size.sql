-- Size of one piece of a pantry row counted in pieces (ks), e.g. a 250 g pack of butter: 0.25 kg.
-- Stock kept by product type used to lose the pack size written on the receipt line, so a recipe asking
-- for 100 g of butter could not tell that "2 ks" covers it. Both columns are nullable and additive: a
-- row without a known piece size behaves exactly as before.
ALTER TABLE "pantry_items" ADD COLUMN IF NOT EXISTS "piece_quantity" numeric(10, 3);
ALTER TABLE "pantry_items" ADD COLUMN IF NOT EXISTS "piece_unit" "item_unit";
ALTER TABLE "pantry_items" DROP CONSTRAINT IF EXISTS "pantry_items_piece_size_check";
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_piece_size_check"
  CHECK (("piece_quantity" IS NULL AND "piece_unit" IS NULL) OR ("piece_quantity" > 0 AND "piece_unit" IS NOT NULL));
