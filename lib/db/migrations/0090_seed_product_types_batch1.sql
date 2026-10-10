-- Product types added to lib/product-types.ts from the taxonomy seed proposal (docs/12): tea, wine,
-- spirits, bar chocolate, crisps, soap, deodorant. Insert-only, so it is safe to run before the code
-- that classifies by them is live. No product is reassigned here: `scripts/assign-product-types.ts`
-- does that, after a dry run on the real catalog.

INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('caj', 'Čaj', 'Potraviny', 'kg'),
  ('vino', 'Víno', 'Potraviny', 'l'),
  ('lihoviny', 'Lihoviny', 'Potraviny', 'l'),
  ('cokolada-tabulkova', 'Čokoláda tabulková', 'Potraviny', 'kg'),
  ('chipsy-snacky', 'Chipsy', 'Potraviny', 'kg'),
  ('mydlo', 'Mýdlo', 'Drogerie', 'ks'),
  ('deodoranty', 'Deodorant', 'Drogerie', 'ks')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit";
