-- Product Knowledge Dictionary (PKD), phase 1.
-- Knowledge is separate from product_types: external source records may map to an internal Product Type,
-- but importing a source classification must never create one automatically.

CREATE TYPE "pkd_source_type" AS ENUM ('gs1_gpc', 'open_food_facts', 'cz_cpa', 'seed_catalog', 'ocr', 'manual');
CREATE TYPE "pkd_entry_status" AS ENUM ('candidate', 'approved', 'rejected', 'inactive');
CREATE TYPE "pkd_mapping_status" AS ENUM ('unmapped', 'candidate', 'mapped', 'rejected');

CREATE TABLE IF NOT EXISTS "pkd_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_type" "pkd_source_type" NOT NULL,
  "source_version" text NOT NULL,
  "acquired_at" timestamptz NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "pkd_sources_type_version_unique" UNIQUE ("source_type", "source_version")
);

CREATE TABLE IF NOT EXISTS "pkd_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "stable_key" text NOT NULL UNIQUE,
  "canonical_name" text NOT NULL,
  "language" text NOT NULL DEFAULT 'cs',
  "category" "item_category",
  "subcategory" text,
  "physical_form" text,
  "processing_state" text,
  "comparison_unit" "item_unit",
  "attributes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "contains" text[] NOT NULL DEFAULT '{}',
  "excludes" text[] NOT NULL DEFAULT '{}',
  "status" "pkd_entry_status" NOT NULL DEFAULT 'candidate',
  "confidence" numeric(4,3),
  "product_type_id" uuid REFERENCES "product_types"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pkd_entries_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);
CREATE INDEX IF NOT EXISTS "pkd_entries_canonical_name_idx" ON "pkd_entries" ("canonical_name");
CREATE INDEX IF NOT EXISTS "pkd_entries_product_type_idx" ON "pkd_entries" ("product_type_id");

CREATE TABLE IF NOT EXISTS "pkd_synonyms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entry_id" uuid NOT NULL REFERENCES "pkd_entries"("id") ON DELETE CASCADE,
  "synonym" text NOT NULL,
  "language" text NOT NULL DEFAULT 'cs',
  "normalized" text NOT NULL,
  CONSTRAINT "pkd_synonyms_entry_normalized_unique" UNIQUE ("entry_id", "normalized")
);
CREATE INDEX IF NOT EXISTS "pkd_synonyms_normalized_idx" ON "pkd_synonyms" ("normalized");

CREATE TABLE IF NOT EXISTS "pkd_external_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entry_id" uuid NOT NULL REFERENCES "pkd_entries"("id") ON DELETE CASCADE,
  "source_id" uuid NOT NULL REFERENCES "pkd_sources"("id") ON DELETE CASCADE,
  "external_id" text NOT NULL,
  "external_parent_id" text,
  "mapping_status" "pkd_mapping_status" NOT NULL DEFAULT 'candidate',
  "confidence" numeric(4,3),
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "pkd_external_mappings_source_external_unique" UNIQUE ("source_id", "external_id"),
  CONSTRAINT "pkd_external_mappings_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);
CREATE INDEX IF NOT EXISTS "pkd_external_mappings_entry_idx" ON "pkd_external_mappings" ("entry_id");
