-- Adds Billa as an external price source (docs/01_CURRENT_STATE.md section 15, second connector).
-- The enum value is added with IF NOT EXISTS so re-running is safe.
--
-- drizzle-kit also listed the pantry_location values and household_members index from 0013/0014
-- here, because those hand-written migrations shipped without snapshots. They are already applied,
-- so only the Billa statement is kept; the accompanying 0015 snapshot reflects the full schema.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'billa';
