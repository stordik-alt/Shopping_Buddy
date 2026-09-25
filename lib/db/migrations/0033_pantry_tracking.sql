-- How closely the household watches a pantry item (lib/pantry.ts): normal / rare (salt, spices — no
-- "asi došlo" estimate, check-in every few months) / off (never estimated or asked). Existing rows: normal.
CREATE TYPE "public"."pantry_tracking" AS ENUM('normal', 'rare', 'off');--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "tracking" "pantry_tracking" DEFAULT 'normal' NOT NULL;