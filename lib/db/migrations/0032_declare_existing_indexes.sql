-- Declares in lib/db/schema.ts what earlier hand-written migrations created but the schema did not
-- describe, so the schema documents the whole database and Drizzle's snapshot knows these objects:
-- - prices_product_context_observed_idx, prices_store_location_observed_idx (migration 0010);
-- - store_locations_store_address_city_unique_idx (migration 0011);
-- - the unique constraint on invitations.token, which the production database has under Postgres's
--   own name `invitations_token_key` (created before the Drizzle baseline), while a database built
--   from these migrations got `invitations_token_unique` from 0000.
-- Nothing changes in a database that already has them: every statement is conditional. A database
-- built from the migrations ends up with the same objects under the same names.
CREATE INDEX IF NOT EXISTS "prices_product_context_observed_idx" ON "prices" USING btree ("product_id","store_id","store_location_id","price_scope","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prices_store_location_observed_idx" ON "prices" USING btree ("store_location_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_locations_store_address_city_unique_idx" ON "store_locations" USING btree ("store_id",lower(regexp_replace(trim("address"), '\s+', ' ', 'g')),lower(regexp_replace(trim("city"), '\s+', ' ', 'g')));--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"invitations"'::regclass AND conname = 'invitations_token_key') THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"invitations"'::regclass AND conname = 'invitations_token_unique') THEN
      ALTER TABLE "invitations" RENAME CONSTRAINT "invitations_token_unique" TO "invitations_token_key";
    ELSE
      ALTER TABLE "invitations" ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");
    END IF;
  END IF;
END $$;
