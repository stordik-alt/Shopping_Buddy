-- Product types, phase 3 (docs/12_PRODUCT_TYPES.md): a shopping-list item can carry the product types
-- the household chose for it. Nullable and additive: existing items keep deriving their types from
-- their names.
ALTER TABLE "shopping_list_items" ADD COLUMN IF NOT EXISTS "product_types" text[];
