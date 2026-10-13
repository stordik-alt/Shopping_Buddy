-- Product type added to lib/product-types.ts (docs/12): jarní cibulka (spring onion), which Albert sells as
-- "Cibule lahůdková" and which is no longer part of the type Cibule. Insert-only, so it is safe to run before
-- the code that classifies by it is live. No product is reassigned here: `pnpm db:assign-product-types` does
-- that, after a dry run on the real catalog.

INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('jarni-cibulka', 'Jarní cibulka', 'Potraviny', 'ks')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit";
