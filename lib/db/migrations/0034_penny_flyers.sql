-- Adds Penny's weekly flyer as its own external price source (lib/ingestion/penny-flyer.ts): the
-- offers read off the flyer pages by a model, validated like Albert's. Its own value, apart from
-- `penny` (the web shop's SKUs), because a flyer offer has no SKU — its identity is its printed name
-- and size (flyerProductKey). Safe to re-run.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'penny_flyer';
