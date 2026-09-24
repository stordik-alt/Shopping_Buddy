-- Per-user store preferences: the stores a user has chosen as "in my area" (chain-level, and
-- optionally a specific branch) plus how far they are willing to go for a shop.
--
-- drizzle-kit generated these statements in an order that would fail: the composite foreign key on
-- member_stores needs the unique index on store_locations(id, store_id) to exist first. The order
-- below is corrected and every statement is safe to re-run. Purely additive; existing rows are not
-- touched (the unique index on the primary key plus store_id is true for any existing data).

-- The pair (id, store_id) is unique because id alone already is; this index only lets member_stores
-- reference it.
CREATE UNIQUE INDEX IF NOT EXISTS "store_locations_id_store_id_unique" ON "store_locations" USING btree ("id","store_id");--> statement-breakpoint

ALTER TABLE "household_members" ADD COLUMN IF NOT EXISTS "max_distance_km" numeric(4, 1);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "household_members" ADD CONSTRAINT "household_members_max_distance_range" CHECK ("household_members"."max_distance_km" IS NULL OR ("household_members"."max_distance_km" > 0 AND "household_members"."max_distance_km" <= 50));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "member_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"store_location_id" uuid
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "member_stores" ADD CONSTRAINT "member_stores_member_id_household_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "member_stores" ADD CONSTRAINT "member_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
-- A named branch must belong to the named chain. MATCH SIMPLE: a NULL store_location_id (a chain-level
-- row) skips the check.
DO $$ BEGIN
  ALTER TABLE "member_stores" ADD CONSTRAINT "member_stores_store_location_id_store_id_store_locations_id_store_id_fk" FOREIGN KEY ("store_location_id","store_id") REFERENCES "public"."store_locations"("id","store_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_stores_chain_unique" ON "member_stores" USING btree ("member_id","store_id") WHERE "member_stores"."store_location_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "member_stores_branch_unique" ON "member_stores" USING btree ("member_id","store_location_id") WHERE "member_stores"."store_location_id" IS NOT NULL;
