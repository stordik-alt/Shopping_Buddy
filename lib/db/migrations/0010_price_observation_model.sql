CREATE TYPE "public"."price_scope" AS ENUM('STORE', 'STORE_FORMAT', 'REGION', 'CHAIN');--> statement-breakpoint
CREATE TYPE "public"."price_source_type" AS ENUM('RECEIPT', 'OFFICIAL', 'FLYER', 'API', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."price_location_resolution" AS ENUM('UNKNOWN', 'RESOLVED', 'NOT_APPLICABLE');--> statement-breakpoint

ALTER TABLE "prices" ADD COLUMN "store_id" uuid;--> statement-breakpoint
UPDATE "prices" AS p
SET "store_id" = sl."store_id"
FROM "store_locations" AS sl
WHERE sl."id" = p."store_location_id";--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "store_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "prices" ALTER COLUMN "store_location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" RENAME COLUMN "recorded_at" TO "observed_at";--> statement-breakpoint

ALTER TABLE "prices" ADD COLUMN "price_scope" "price_scope" DEFAULT 'STORE' NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "source_type" "price_source_type" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "location_resolution" "price_location_resolution" DEFAULT 'RESOLVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "valid_from" date;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "valid_until" date;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "source_reference" text;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "confidence" numeric(4, 3);--> statement-breakpoint

UPDATE "prices" SET "valid_from" = "observed_at";--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "valid_from" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "prices" ADD CONSTRAINT "prices_valid_range_check" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from");--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_store_scope_location_check" CHECK (
  "price_scope" <> 'STORE'
  OR (
    "store_id" IS NOT NULL
    AND (
      ("location_resolution" = 'RESOLVED' AND "store_location_id" IS NOT NULL)
      OR ("location_resolution" = 'UNKNOWN' AND "store_location_id" IS NULL)
    )
  )
);--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_chain_scope_location_check" CHECK (
  "price_scope" <> 'CHAIN'
  OR ("store_id" IS NOT NULL AND "store_location_id" IS NULL AND "location_resolution" = 'NOT_APPLICABLE')
);--> statement-breakpoint

CREATE INDEX "prices_product_context_observed_idx"
  ON "prices" USING btree ("product_id", "store_id", "store_location_id", "price_scope", "observed_at");--> statement-breakpoint
CREATE INDEX "prices_store_location_observed_idx"
  ON "prices" USING btree ("store_location_id", "observed_at");--> statement-breakpoint
