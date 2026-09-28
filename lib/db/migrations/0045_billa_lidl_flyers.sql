-- Adds Billa's and Lidl's weekly flyers as their own external price sources
-- (lib/ingestion/billa-flyer.ts, lib/ingestion/lidl-flyer.ts): offers read off the flyer pages by a
-- model, validated like Albert's and Penny's. Own values, apart from `billa`/`lidl` (their web
-- sources' SKUs), because a flyer offer has no SKU — its identity is its printed name and size
-- (flyerProductKey). Safe to re-run.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'billa_flyer';--> statement-breakpoint
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'lidl_flyer';
