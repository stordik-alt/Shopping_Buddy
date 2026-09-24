-- One official (retailer-published) price observation per product, store, retailer SKU and day, so
-- a repeat ingestion run the same day refreshes the row instead of duplicating it (see
-- recordOfficialPrice() in lib/db/queries.ts). Partial: receipt-based observations may legitimately
-- repeat within a day. Checked against the shared database before writing this: no existing row
-- violates it. IF NOT EXISTS so re-running is safe.
CREATE UNIQUE INDEX IF NOT EXISTS "prices_official_daily_unique" ON "prices" USING btree ("product_id","store_id","price_scope","source_type","source_reference","observed_at") WHERE "prices"."source_type" = 'OFFICIAL' AND "prices"."source_reference" IS NOT NULL;
