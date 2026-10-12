-- The household's wanted stock per PRODUCT TYPE (docs/36_PANTRY_STOCK_LEVELS.md): a minimum (stock up when
-- the stock of the whole type nears it) and a maximum (how much to stock up to), in `unit`. Set in the
-- Profil, no longer on a single pantry row, so the app can offer the cheapest variant of the type.
-- Additive: pantry_items.min_quantity / max_quantity stay in place but are no longer read.
CREATE TABLE IF NOT EXISTS "household_stock_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "product_type_id" uuid NOT NULL REFERENCES "product_types"("id") ON DELETE CASCADE,
  "min_quantity" numeric(10, 3) NOT NULL,
  "max_quantity" numeric(10, 3) NOT NULL,
  "unit" "item_unit" NOT NULL,
  CONSTRAINT "household_stock_levels_check" CHECK ("min_quantity" >= 0 AND "max_quantity" > "min_quantity")
);
CREATE UNIQUE INDEX IF NOT EXISTS "household_stock_levels_household_type_unique" ON "household_stock_levels" ("household_id", "product_type_id");

-- Carry over the levels set on pantry rows during the first day: a row's own type, else its product's type.
INSERT INTO "household_stock_levels" ("household_id", "product_type_id", "min_quantity", "max_quantity", "unit")
SELECT DISTINCT ON (pi.household_id, COALESCE(pi.product_type_id, p.product_type_id))
  pi.household_id, COALESCE(pi.product_type_id, p.product_type_id), pi.min_quantity, pi.max_quantity, pi.unit
FROM "pantry_items" pi
LEFT JOIN "products" p ON p.id = pi.product_id
WHERE pi.min_quantity IS NOT NULL AND pi.max_quantity IS NOT NULL AND COALESCE(pi.product_type_id, p.product_type_id) IS NOT NULL
ORDER BY pi.household_id, COALESCE(pi.product_type_id, p.product_type_id), pi.id
ON CONFLICT DO NOTHING;
