CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE recipe_catalog
  ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '';

UPDATE recipe_catalog
SET search_text = lower(
  coalesce(title, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(ingredients::text, '')
) || ' ' || lower(translate(
  coalesce(title, '') || ' ' ||
  coalesce(description, '') || ' ' ||
  coalesce(ingredients::text, ''),
  'áčďéěíňóřšťúůýž',
  'acdeeinorstuuyz'
))
WHERE search_text = '';

CREATE INDEX IF NOT EXISTS recipe_catalog_search_text_trgm_idx
  ON recipe_catalog USING gin (search_text gin_trgm_ops);
