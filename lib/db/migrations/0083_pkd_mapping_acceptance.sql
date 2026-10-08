CREATE TYPE "pkd_product_type_mapping_review_decision" AS ENUM ('accepted', 'rejected');

CREATE TABLE "pkd_product_type_mapping_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mapping_id" uuid NOT NULL,
  "decision" "pkd_product_type_mapping_review_decision" NOT NULL,
  "reviewer_id" uuid,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pkd_product_type_mapping_reviews_mapping_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."pkd_product_type_mappings"("id") ON DELETE cascade
);

CREATE INDEX "pkd_product_type_mapping_reviews_mapping_idx" ON "pkd_product_type_mapping_reviews" ("mapping_id");
CREATE INDEX "pkd_product_type_mapping_reviews_reviewer_idx" ON "pkd_product_type_mapping_reviews" ("reviewer_id");
