-- Review queue for proposing reusable Product Subtypes from future retailer and taxonomy feeds.
-- Additive only: candidates are not active subtypes and are never assigned to products automatically.
CREATE TABLE IF NOT EXISTS "product_subtype_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "parent_product_type_key" text NOT NULL,
  "parent_product_type_id" uuid REFERENCES "product_types"("id") ON DELETE RESTRICT,
  "candidate_key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "definition" text NOT NULL DEFAULT '',
  "includes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "excludes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_type" text NOT NULL CHECK ("source_type" IN ('retailer', 'gs1_gpc', 'open_food_facts', 'cz_cpa', 'ocr', 'manual')),
  "source_name" text NOT NULL,
  "source_version" text,
  "source_record_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'candidate' CHECK ("status" IN ('candidate', 'approved', 'rejected', 'duplicate')),
  "review_note" text,
  "duplicate_of_subtype_id" uuid REFERENCES "product_subtypes"("id") ON DELETE RESTRICT,
  "approved_subtype_id" uuid REFERENCES "product_subtypes"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "product_subtype_candidates_parent_normalized_name_unique" UNIQUE ("parent_product_type_key", "normalized_name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_subtype_candidates_status_created_idx" ON "product_subtype_candidates" ("status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_subtype_candidates_parent_status_idx" ON "product_subtype_candidates" ("parent_product_type_key", "status");
