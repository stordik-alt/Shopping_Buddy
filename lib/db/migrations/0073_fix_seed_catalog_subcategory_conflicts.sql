-- Correct two existing catalog products that conflict with the curated seed taxonomy.
-- Both are canned/preserved food and the seed catalog classifies them as Potraviny → Konzervy.
-- Keep this additive and idempotent: only the exact product names are touched.
UPDATE "products" AS p
SET "subcategory_id" = ps."id"
FROM "product_subcategories" AS ps
JOIN "product_categories" AS pc
  ON pc."name" = 'Potraviny'
WHERE p."name" IN (
  'Efko Stříbřité cibulky',
  'Kitchin Rajčatový protlak dvakrát zahuštěný'
)
  AND p."category_id" = pc."id"
  AND ps."category" = 'Potraviny'
  AND ps."name" = 'Konzervy'
  AND p."subcategory_id" IS DISTINCT FROM ps."id";
