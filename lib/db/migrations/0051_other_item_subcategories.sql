-- Subcategories for the item category "Ostatní" (clothing, electronics, tobacco/e-cigarettes, other),
-- so such pantry items can be placed like any other. Additive and idempotent: only inserts rows that
-- lib/product-subcategories.ts's PRODUCT_SUBCATEGORIES.Ostatní lists.
INSERT INTO "product_subcategories" ("category", "name") VALUES
  ('Ostatní', 'Oblečení a obuv'),
  ('Ostatní', 'Elektronika'),
  ('Ostatní', 'Tabák a e-cigarety'),
  ('Ostatní', 'Ostatní zboží')
ON CONFLICT DO NOTHING;
