-- Product Type -> Product Subtype hierarchy foundation (docs/12_PRODUCT_TYPES.md).
-- Additive only: existing catalog classifications are not rewritten and subtype remains optional.
CREATE TABLE IF NOT EXISTS "product_subtypes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_type_id" uuid NOT NULL,
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_subtypes_product_type_fk"
    FOREIGN KEY ("product_type_id") REFERENCES "public"."product_types"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_subtypes_type_name_unique" ON "product_subtypes" ("product_type_id", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_subtypes_type_id_unique" ON "product_subtypes" ("product_type_id", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_subtypes_product_type_active_sort_idx" ON "product_subtypes" ("product_type_id", "is_active", "sort_order", "name");
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_subtype_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_product_subtype_same_type_fk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_product_subtype_same_type_fk"
      FOREIGN KEY ("product_type_id", "product_subtype_id")
      REFERENCES "public"."product_subtypes" ("product_type_id", "id")
      ON DELETE RESTRICT;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_product_subtype_requires_type'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_product_subtype_requires_type"
      CHECK ("product_subtype_id" IS NULL OR "product_type_id" IS NOT NULL);
  END IF;
END
$$;
