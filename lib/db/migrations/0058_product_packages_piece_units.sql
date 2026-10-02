-- Phase 5 of product package modeling:
-- allow the persistent package catalog to store explicit piece-count packages.
-- Existing kg/l rows are untouched; old code ignores ks rows until the corresponding reader is live.
ALTER TABLE "product_packages"
  DROP CONSTRAINT IF EXISTS "product_packages_canonical_unit";
--> statement-breakpoint
ALTER TABLE "product_packages"
  ADD CONSTRAINT "product_packages_canonical_unit"
  CHECK ("unit" IN ('ks', 'kg', 'l'));