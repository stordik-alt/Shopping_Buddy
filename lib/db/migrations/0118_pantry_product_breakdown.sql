CREATE TABLE "pantry_item_contents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pantry_item_id" uuid NOT NULL REFERENCES "pantry_items"("id") ON DELETE CASCADE,
  "product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
  "identity_key" text NOT NULL,
  "name" text NOT NULL,
  "quantity" numeric(10, 3) NOT NULL,
  "unit" "item_unit" NOT NULL,
  "piece_quantity" numeric(10, 3),
  "piece_unit" "item_unit",
  "added_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "pantry_item_contents_piece_size_check" CHECK (("piece_quantity" IS NULL AND "piece_unit" IS NULL) OR ("piece_quantity" > 0 AND "piece_unit" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_item_contents_identity_unique" ON "pantry_item_contents" ("pantry_item_id", "identity_key");
--> statement-breakpoint
CREATE INDEX "pantry_item_contents_product_idx" ON "pantry_item_contents" ("product_id");
