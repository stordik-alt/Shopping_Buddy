CREATE TYPE "pkd_product_type_mapping_status" AS ENUM ('candidate', 'accepted', 'rejected');

CREATE TYPE "pkd_product_type_mapping_method" AS ENUM ('exact_name', 'rule_match');

CREATE TABLE "pkd_product_type_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pkd_entry_id" uuid NOT NULL,
  "product_type_id" uuid NOT NULL,
  "mapping_version" text NOT NULL,
  "method" "pkd_product_type_mapping_method" NOT NULL,
  "confidence" numeric(4, 3) NOT NULL,
  "status" "pkd_product_type_mapping_status" DEFAULT 'candidate' NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pkd_product_type_mappings_confidence_range" CHECK ("pkd_product_type_mappings"."confidence" >= 0 AND "pkd_product_type_mappings"."confidence" <= 1),
  CONSTRAINT "pkd_product_type_mappings_pkd_entry_fk" FOREIGN KEY ("pkd_entry_id") REFERENCES "public"."pkd_entries"("id") ON DELETE cascade,
  CONSTRAINT "pkd_product_type_mappings_product_type_fk" FOREIGN KEY ("product_type_id") REFERENCES "public"."product_types"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX "pkd_product_type_mappings_entry_version_unique" ON "pkd_product_type_mappings" ("pkd_entry_id", "mapping_version");
CREATE INDEX "pkd_product_type_mappings_product_type_idx" ON "pkd_product_type_mappings" ("product_type_id");
CREATE INDEX "pkd_product_type_mappings_status_idx" ON "pkd_product_type_mappings" ("status");
