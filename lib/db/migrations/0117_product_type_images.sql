-- Keep this after 0116: the migration runner applies files in name order and product_types is
-- created in 0062. IF NOT EXISTS also covers a development database that saw the old 0057 name.
ALTER TABLE "product_types" ADD COLUMN IF NOT EXISTS "image_ref" text;
