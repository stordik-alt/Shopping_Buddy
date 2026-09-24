-- Accent- and case-insensitive product search (lib/product-search.ts): `search_name` is the product
-- name without diacritics, lower-cased, kept by the database itself as a stored generated column.
-- The character map is the same one `normalizeSearchText()` uses; a DB test checks the two agree.
-- Adding a generated column rewrites the table once (a few hundred rows today). IF NOT EXISTS so
-- re-running is safe.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "search_name" text GENERATED ALWAYS AS (lower(translate(name, 'áäčďéěíĺľňóöôŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÖÔŔŘŠŤÚŮÜÝŽ', 'aacdeeillnooorrstuuuyzAACDEEILLNOOORRSTUUUYZ'))) STORED;
