-- New subcategories (owner approval 2026-10-06): Drogerie ▸ Zdraví a doplňky stravy and Doplňky a
-- oblečení, Domácnost ▸ Zahrada. Additive and idempotent: only inserts the names
-- lib/product-subcategories.ts's PRODUCT_SUBCATEGORIES now lists. Existing rows are moved into them by
-- `pnpm db:reclassify-products`, not here.
INSERT INTO "product_subcategories" ("category", "name") VALUES
  ('Drogerie', 'Zdraví a doplňky stravy'),
  ('Drogerie', 'Doplňky a oblečení'),
  ('Domácnost', 'Zahrada')
ON CONFLICT DO NOTHING;
