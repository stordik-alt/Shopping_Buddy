-- PKD candidate generation for previously unmapped product-type identities.
-- Candidates are proposals only. They do not alter product_types or catalog assignments.

CREATE TYPE "pkd_candidate_status" AS ENUM ('candidate', 'accepted', 'rejected');

CREATE TABLE IF NOT EXISTS "pkd_product_type_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidate_key" text NOT NULL,
  "canonical_name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "language" text NOT NULL,
  "category" "item_category",
  "subcategory" text,
  "physical_form" text,
  "processing_state" text,
  "comparison_unit" "item_unit",
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_entry_ids" uuid[] NOT NULL DEFAULT '{}',
  "confidence" numeric(4,3),
  "status" "pkd_candidate_status" NOT NULL DEFAULT 'candidate',
  "candidate_version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pkd_product_type_candidates_key_version_unique" UNIQUE ("candidate_key", "candidate_version"),
  CONSTRAINT "pkd_product_type_candidates_confidence_range"
    CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

CREATE INDEX IF NOT EXISTS "pkd_product_type_candidates_normalized_idx"
  ON "pkd_product_type_candidates" ("normalized_name");
CREATE INDEX IF NOT EXISTS "pkd_product_type_candidates_status_idx"
  ON "pkd_product_type_candidates" ("status");
