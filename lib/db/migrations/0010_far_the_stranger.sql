CREATE TYPE "public"."product_source" AS ENUM('lidl');--> statement-breakpoint
CREATE TABLE "product_external_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source" "product_source" NOT NULL,
	"external_id" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_external_refs" ADD CONSTRAINT "product_external_refs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_external_refs_source_external_id_idx" ON "product_external_refs" USING btree ("source","external_id");