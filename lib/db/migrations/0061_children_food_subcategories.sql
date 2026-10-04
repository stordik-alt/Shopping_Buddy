-- Food subcategories under Děti (owner request 2026-10-04: "Přidej do Děti i potravinové
-- podkategorie"). Additive and idempotent: only inserts the names lib/product-subcategories.ts's
-- PRODUCT_SUBCATEGORIES.Děti now lists. Existing products are placed by
-- `pnpm db:recategorize-products` (fills empty subcategories only), not here.
INSERT INTO "product_subcategories" ("category", "name") VALUES
  ('Děti', 'Kojenecké mléko'),
  ('Děti', 'Příkrmy'),
  ('Děti', 'Kaše a cereálie'),
  ('Děti', 'Dětské svačinky'),
  ('Děti', 'Dětské nápoje')
ON CONFLICT DO NOTHING;
