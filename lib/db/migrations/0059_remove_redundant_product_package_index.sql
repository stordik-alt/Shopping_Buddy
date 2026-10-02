-- The unique product/size index already starts with product_id and serves product-only lookups.
-- Keep the unique constraint/index; remove the redundant product_id-only index to reduce
-- index storage and write maintenance overhead.
DROP INDEX IF EXISTS "product_packages_product_idx";
