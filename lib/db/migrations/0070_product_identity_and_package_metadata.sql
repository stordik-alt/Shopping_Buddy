-- Product identity + package metadata for the curated catalog seed.
-- Keep these fields nullable so the existing live catalog remains valid and old observations
-- are not rewritten just because the richer identity model is introduced.
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "brand" text;
--> statement-breakpoint
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "variant" text;
--> statement-breakpoint
ALTER TABLE "product_packages"
  ADD COLUMN IF NOT EXISTS "package_count" integer;
--> statement-breakpoint
ALTER TABLE "product_packages"
  ADD COLUMN IF NOT EXISTS "package_unit_quantity" numeric(10, 3);
--> statement-breakpoint
ALTER TABLE "product_packages"
  ADD COLUMN IF NOT EXISTS "package_unit" "item_unit";
--> statement-breakpoint
ALTER TABLE "product_packages"
  ADD COLUMN IF NOT EXISTS "package_type" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_packages"
    ADD CONSTRAINT "product_packages_package_count_positive"
    CHECK ("package_count" IS NULL OR "package_count" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_packages"
    ADD CONSTRAINT "product_packages_package_unit_quantity_positive"
    CHECK ("package_unit_quantity" IS NULL OR "package_unit_quantity" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_packages"
    ADD CONSTRAINT "product_packages_package_unit_pair"
    CHECK (("package_unit_quantity" IS NULL AND "package_unit" IS NULL)
      OR ("package_unit_quantity" IS NOT NULL AND "package_unit" IS NOT NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
