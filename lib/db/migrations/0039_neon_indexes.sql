-- Indexes for the reads that used most of the database's compute (pg_stat_user_tables, 2026-09-26):
-- deals looked up by product read the whole table every time (26 billion rows in total), and text
-- search read every product. Indexes only — the running code is unaffected. Safe to re-run.
CREATE INDEX IF NOT EXISTS "deals_product_store_idx" ON "deals" USING btree ("product_id","store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_external_refs_product_idx" ON "product_external_refs" USING btree ("product_id");--> statement-breakpoint
-- pg_trgm is a trusted extension on Neon, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_name_trgm_idx" ON "products" USING gin ("search_name" gin_trgm_ops);
