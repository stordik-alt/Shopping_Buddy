-- The Zásoby section has six storage folders; the enum only knew the first four, so moving an item
-- to Lékárnička or Drogérka would have been rejected by the database. Purely additive: existing rows
-- and their locations are untouched, and IF NOT EXISTS makes a partial re-run safe.
ALTER TYPE "public"."pantry_location" ADD VALUE IF NOT EXISTS 'Lékárnička';--> statement-breakpoint
ALTER TYPE "public"."pantry_location" ADD VALUE IF NOT EXISTS 'Drogérka';
