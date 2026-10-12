-- A household's refused restock suggestions (docs/36_PANTRY_STOCK_LEVELS.md): one row per refused offer
-- (product type, product and the day the promotion ends), shared by every member. A different or better
-- promotion has another product or end date, so it is offered again. Rows of ended promotions are inert
-- and removed whenever a new refusal is saved.
CREATE TABLE IF NOT EXISTS "restock_dismissals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "product_type_id" uuid NOT NULL REFERENCES "product_types"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "valid_until" date NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "restock_dismissals_unique" ON "restock_dismissals" ("household_id", "product_type_id", "product_id", "valid_until");
