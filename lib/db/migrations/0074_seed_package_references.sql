-- Seed package/reference evidence for OCR matching.
-- This is deliberately separate from product_packages: ranges and unspecified packaging are
-- reference-only and must never become sellable package rows.
CREATE TABLE IF NOT EXISTS "seed_package_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "seed_id" text NOT NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE CASCADE,
  "source_document" text NOT NULL,
  "source_page" integer NOT NULL,
  "category" text NOT NULL,
  "subcategory" text NOT NULL,
  "brand" text,
  "product_family" text NOT NULL,
  "resolution" text NOT NULL,
  "package_options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "normalization_status" text NOT NULL,
  "imported_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seed_package_references_seed_id_unique"
  ON "seed_package_references" ("seed_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seed_package_references_product_idx"
  ON "seed_package_references" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seed_package_references_resolution_idx"
  ON "seed_package_references" ("resolution");
