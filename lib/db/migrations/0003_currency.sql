-- Purpose: close docs/03_DATABASE.md rule 9 ("Prices must have explicit currency"), which
-- was violated — no money column anywhere had a currency. Adds an explicit ISO 4217 currency
-- column, defaulted to CZK (the first and currently only market, docs/00_PROJECT_CONTEXT.md),
-- to households (home currency) and prices/deals (product-catalog currency). Existing rows are
-- backfilled to CZK via the column default, which is accurate for all current data.

ALTER TABLE households ADD COLUMN currency text NOT NULL DEFAULT 'CZK';
ALTER TABLE prices ADD COLUMN currency text NOT NULL DEFAULT 'CZK';
ALTER TABLE deals ADD COLUMN currency text NOT NULL DEFAULT 'CZK';
