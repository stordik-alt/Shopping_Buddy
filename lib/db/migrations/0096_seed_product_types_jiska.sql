-- Product type added to lib/product-types.ts after the pantry type backfill (docs/12): roux (jíška), which
-- a receipt line in the pantry had no type for. Insert-only, so it is safe to run before the code that
-- classifies by it is live. No product is reassigned here: `scripts/apply-product-types-batch.ts` does
-- that, after a dry run on the real catalog.

INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('jiska', 'Jíška', 'Potraviny', 'kg')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit";
