-- Adds Penny as an external price source (docs/01_CURRENT_STATE.md section 15, third connector).
-- IF NOT EXISTS so re-running is safe.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'penny';
