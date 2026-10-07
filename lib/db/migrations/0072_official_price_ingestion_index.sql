-- Speeds the ingestion lookup that loads the latest official chain price per retailer SKU.
-- The existing unique daily index starts with product_id, while ingestion filters by store_id
-- and source_reference and orders each SKU by observed_at DESC for DISTINCT ON.
CREATE INDEX IF NOT EXISTS "prices_official_chain_ref_observed_idx"
  ON "prices" ("store_id", "source_reference", "observed_at" DESC)
  WHERE "price_scope" = 'CHAIN'
    AND "source_type" = 'OFFICIAL'
    AND "source_reference" IS NOT NULL;
