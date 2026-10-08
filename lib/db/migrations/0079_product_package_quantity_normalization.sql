-- Connect existing product packages to the universal PKD quantity model.
-- Existing package quantity/unit values are preserved; normalization metadata starts NULL.

ALTER TABLE "product_packages"
  ADD COLUMN IF NOT EXISTS "base_unit" "quantity_unit",
  ADD COLUMN IF NOT EXISTS "conversion_method" "conversion_method",
  ADD COLUMN IF NOT EXISTS "conversion_confidence" numeric(4,3),
  ADD COLUMN IF NOT EXISTS "net_quantity" numeric(20,9),
  ADD COLUMN IF NOT EXISTS "net_unit" "quantity_unit",
  ADD COLUMN IF NOT EXISTS "drained_quantity" numeric(20,9),
  ADD COLUMN IF NOT EXISTS "drained_unit" "quantity_unit";

ALTER TABLE "product_packages"
  ADD CONSTRAINT "product_packages_conversion_confidence_range"
    CHECK ("conversion_confidence" IS NULL OR ("conversion_confidence" >= 0 AND "conversion_confidence" <= 1)),
  ADD CONSTRAINT "product_packages_net_quantity_positive"
    CHECK ("net_quantity" IS NULL OR "net_quantity" > 0),
  ADD CONSTRAINT "product_packages_drained_quantity_positive"
    CHECK ("drained_quantity" IS NULL OR "drained_quantity" > 0);
