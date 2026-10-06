-- Idempotency/provenance for curated catalog seed imports.
-- A seed row is not a retailer SKU, so it deliberately has its own reference table rather than
-- overloading product_external_refs (which represents live retailer identities).
CREATE TABLE IF NOT EXISTS "product_seed_refs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seed_id" text NOT NULL,
  "product_id" uuid NOT NULL,
  "source_document" text NOT NULL,
  "source_page" integer NOT NULL,
  "normalization_status" text NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_seed_refs_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_seed_refs_seed_id_unique"
  ON "product_seed_refs" ("seed_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_seed_refs_product_idx"
  ON "product_seed_refs" ("product_id");
