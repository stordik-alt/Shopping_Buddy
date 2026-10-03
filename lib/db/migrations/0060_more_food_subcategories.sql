-- More Potraviny subcategories (owner request 2026-10-03: "Koření, Vejce a další věci"). Additive and
-- idempotent: only inserts the names lib/product-subcategories.ts's PRODUCT_SUBCATEGORIES.Potraviny
-- now lists. Existing rows are moved into them by scripts/move-to-new-subcategories.ts, not here.
INSERT INTO "product_subcategories" ("category", "name") VALUES
  ('Potraviny', 'Vejce'),
  ('Potraviny', 'Ryby a mořské plody'),
  ('Potraviny', 'Luštěniny'),
  ('Potraviny', 'Ořechy, semínka a sušené ovoce'),
  ('Potraviny', 'Káva a čaj'),
  ('Potraviny', 'Alkoholické nápoje'),
  ('Potraviny', 'Džemy, med a pomazánky'),
  ('Potraviny', 'Lahůdky a hotová jídla'),
  ('Potraviny', 'Rostlinné alternativy'),
  ('Potraviny', 'Mouka a pečení'),
  ('Potraviny', 'Oleje a tuky'),
  ('Potraviny', 'Koření a bylinky')
ON CONFLICT DO NOTHING;
