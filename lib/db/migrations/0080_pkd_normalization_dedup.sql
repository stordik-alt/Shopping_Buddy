-- PKD normalization and safe deduplication candidate layer.
-- Normalization is versioned and non-destructive: equal normalized names produce candidates,
-- never an automatic merge of Product Types, variants, forms, packages, or retailer SKUs.

CREATE TYPE "pkd_normalization_method" AS ENUM ('unicode_fold', 'whitespace_fold', 'punctuation_fold', 'alias_fold');
CREATE TYPE "pkd_dedup_status" AS ENUM ('candidate', 'accepted', 'rejected');

CREATE TABLE IF NOT EXISTS "pkd_entry_normalizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entry_id" uuid NOT NULL REFERENCES "pkd_entries"("id") ON DELETE CASCADE,
  "normalization_version" text NOT NULL,
  "normalized_name" text NOT NULL,
  "identity_key" text NOT NULL,
  "methods" "pkd_normalization_method"[] NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pkd_entry_normalizations_entry_version_unique"
    UNIQUE ("entry_id", "normalization_version")
);
CREATE INDEX IF NOT EXISTS "pkd_entry_normalizations_identity_idx"
  ON "pkd_entry_normalizations" ("identity_key");
CREATE INDEX IF NOT EXISTS "pkd_entry_normalizations_name_idx"
  ON "pkd_entry_normalizations" ("normalized_name");

CREATE TABLE IF NOT EXISTS "pkd_dedup_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "left_entry_id" uuid NOT NULL REFERENCES "pkd_entries"("id") ON DELETE CASCADE,
  "right_entry_id" uuid NOT NULL REFERENCES "pkd_entries"("id") ON DELETE CASCADE,
  "normalization_version" text NOT NULL,
  "reason" text NOT NULL,
  "confidence" numeric(4,3) NOT NULL,
  "status" "pkd_dedup_status" NOT NULL DEFAULT 'candidate',
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "pkd_dedup_candidates_pair_version_unique"
    UNIQUE ("left_entry_id", "right_entry_id", "normalization_version"),
  CONSTRAINT "pkd_dedup_candidates_distinct_entries"
    CHECK ("left_entry_id" <> "right_entry_id"),
  CONSTRAINT "pkd_dedup_candidates_confidence_range"
    CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
CREATE INDEX IF NOT EXISTS "pkd_dedup_candidates_right_idx"
  ON "pkd_dedup_candidates" ("right_entry_id");
