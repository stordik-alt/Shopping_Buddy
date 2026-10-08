-- Refine common manual product types: split laundry detergent and add food mushrooms.
-- Existing generic laundry assignments are reclassified where the product name is explicit;
-- ambiguous capsule/tablet/generic entries become untyped and can be selected again explicitly.

INSERT INTO "product_types" ("key", "name", "category", "unit") VALUES
  ('praci-gel', 'Prací gel', 'Drogerie', 'l'),
  ('praci-prasek', 'Prací prášek', 'Drogerie', 'kg'),
  ('avivaz', 'Aviváž', 'Drogerie', 'l'),
  ('houby', 'Houby', 'Potraviny', 'kg')
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "unit" = EXCLUDED."unit";

UPDATE "products" p
SET
  "product_type_id" = CASE
    WHEN lower(p."name") LIKE '%aviváž%' THEN (SELECT id FROM "product_types" WHERE key = 'avivaz')
    WHEN lower(p."name") LIKE '%prací gel%' OR lower(p."name") LIKE '%gel na praní%' THEN (SELECT id FROM "product_types" WHERE key = 'praci-gel')
    WHEN lower(p."name") LIKE '%prací prášek%' OR lower(p."name") LIKE '%prášek na praní%' THEN (SELECT id FROM "product_types" WHERE key = 'praci-prasek')
    ELSE NULL
  END,
  "product_type_source" = CASE
    WHEN lower(p."name") LIKE '%aviváž%'
      OR lower(p."name") LIKE '%prací gel%'
      OR lower(p."name") LIKE '%gel na praní%'
      OR lower(p."name") LIKE '%prací prášek%'
      OR lower(p."name") LIKE '%prášek na praní%'
    THEN 'rule'
    ELSE NULL
  END
WHERE p."product_type_id" = (SELECT id FROM "product_types" WHERE key = 'praci-prostredek');

DELETE FROM "product_types" WHERE "key" = 'praci-prostredek';
