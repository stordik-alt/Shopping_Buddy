-- Links catalog products to an external price source's own stable id (docs/01_CURRENT_STATE.md
-- section 15, Lidl connector) so re-running an import finds the same product instead of duplicating it.
--
-- Renumbered from 0010_far_the_stranger when merging main, which had independently added its own
-- 0010/0011 (price observation model, receipt store locations). This file was already applied to at
-- least one database under its old name, and this runner tracks migrations by filename, so every
-- statement is written to be safe to re-run rather than fail with "already exists".
DO $$ BEGIN
  CREATE TYPE "public"."product_source" AS ENUM('lidl');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_external_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"source" "product_source" NOT NULL,
	"external_id" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_external_refs" ADD CONSTRAINT "product_external_refs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_external_refs_source_external_id_idx" ON "product_external_refs" USING btree ("source","external_id");
