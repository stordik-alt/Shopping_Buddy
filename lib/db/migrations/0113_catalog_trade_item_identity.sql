-- Additive catalog identity foundation. Existing product IDs, prices, deals and history are untouched.
CREATE TABLE IF NOT EXISTS "trade_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "product_package_id" uuid REFERENCES "product_packages"("id") ON DELETE SET NULL,
  "package_signature" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "trade_items_status_valid" CHECK ("status" IN ('active', 'discontinued', 'needs_review'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trade_items_product_package_unique"
  ON "trade_items" ("product_package_id") WHERE "product_package_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trade_items_product_signature_unique"
  ON "trade_items" ("product_id", "package_signature") WHERE "package_signature" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_items_product_status_idx"
  ON "trade_items" ("product_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_item_identifiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trade_item_id" uuid NOT NULL REFERENCES "trade_items"("id") ON DELETE CASCADE,
  "scheme" text NOT NULL DEFAULT 'GTIN',
  "value" text NOT NULL,
  "market" text,
  "verification_status" text NOT NULL DEFAULT 'unverified',
  "verification_source" text,
  "verified_at" timestamptz,
  "valid_from" date,
  "valid_until" date,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "trade_item_identifiers_scheme_valid" CHECK ("scheme" IN ('GTIN')),
  CONSTRAINT "trade_item_identifiers_verification_status_valid" CHECK ("verification_status" IN ('unverified', 'source_confirmed', 'independently_verified', 'rejected')),
  CONSTRAINT "trade_item_identifiers_validity_range" CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_until" >= "valid_from")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trade_item_identifiers_trade_item_idx"
  ON "trade_item_identifiers" ("trade_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trade_item_identifiers_verified_active_unique"
  ON "trade_item_identifiers" ("scheme", "value", (COALESCE("market", '')))
  WHERE "verification_status" IN ('source_confirmed', 'independently_verified') AND "valid_until" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retailer_product_refs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "trade_item_id" uuid REFERENCES "trade_items"("id") ON DELETE SET NULL,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "source_url" text,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "identity_status" text NOT NULL DEFAULT 'unresolved',
  "raw_name" text,
  "raw_brand" text,
  "raw_package" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "retailer_product_refs_source_nonempty" CHECK (length(trim("source")) > 0),
  CONSTRAINT "retailer_product_refs_external_id_nonempty" CHECK (length(trim("external_id")) > 0),
  CONSTRAINT "retailer_product_refs_identity_status_valid" CHECK ("identity_status" IN ('unresolved', 'matched', 'review_required', 'retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "retailer_product_refs_source_external_id_unique"
  ON "retailer_product_refs" ("source", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retailer_product_refs_trade_item_idx"
  ON "retailer_product_refs" ("trade_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "retailer_product_refs_product_idx"
  ON "retailer_product_refs" ("product_id");
