-- Adds Globus as an external price source: the offers of its national weekly flyers
-- (lib/ingestion/globus.ts). Both statements are safe to re-run. Globus has physical hypermarkets, so
-- the chain row is not online; its flyer deals are stored chain-wide (no branch) because a national
-- flyer holds at every hypermarket, and its branches come from the OpenStreetMap import.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'globus';--> statement-breakpoint
INSERT INTO "stores" ("chain", "is_online") VALUES ('Globus', false) ON CONFLICT ("chain") DO NOTHING;
