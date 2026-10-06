# Shopping_Buddy seed catalog v1

## Purpose

This directory contains the curated seed reference layer derived from the seed PDF catalogues stored in the project library.

The seed catalog is **reference data**, not the live retail catalog. It must not silently create 633 unrelated production products.

## v1 contents

- 633 normalized candidate records
- 583 records currently marked `ready`
- 50 records marked `needs_review`
- 603 records contain at least one explicit package option
- 21 records contain an explicit multipack count

Each record keeps the original source document/page and `raw_item` so normalization decisions remain traceable.

## Normalized fields

- `seed_id`
- `source_document`
- `source_page`
- `source_section`
- `category`
- `subcategory`
- `brand`
- `product_family`
- `variants`
- `package_options`
- `package_count`
- `package_type`
- `normalization_status`
- `confidence`
- `review_reasons`
- `raw_item`

Package quantities are also represented in canonical comparison units where possible:
`g -> kg`, `ml -> l`. The source unit is retained as well.

## Important implementation rule

Do not map the seed rows directly to `products` by display text.

The intended flow is:

seed data
-> normalization / identity resolution
-> canonical product
-> product package
-> store product / external reference
-> prices and deals

Use the existing `products`, `product_packages` and `product_aliases` model rather than creating a parallel live-product catalog.

## Review policy

A record stays `needs_review` when the source gives an open-ended size/range, insufficient package information, or another ambiguity. The import must not invent a package size or product identity to make the record pass.

## Next step

The identity schema required for brand, variant and explicit multipack metadata is additive and documented in `docs/34_CATALOG_IDENTITY.md`.

## Importer

`pnpm db:seed:catalog` is a dry-run by default. It only writes when `--apply` is supplied. The default import selects the 583 `ready` records; `needs_review` rows require the explicit `--include-review` flag.

Idempotency is based on `product_seed_refs.seed_id`, not the product display name. Existing products are linked only on an exact or accent/case-normalized name with compatible category/subcategory/brand. When a known seed brand conflicts with an existing canonical product name, the importer disambiguates the new canonical product name with the known brand instead of merging two distinct brands. Same-family rows in one import are deduplicated to one canonical product per brand. Ambiguous category/subcategory matches are still skipped rather than guessed.

The importer reads the catalog in one bounded batch and never scans the full product catalog. The `--apply` path is intentionally row-by-row because the production database client uses Neon HTTP; it is safe to re-run after an interrupted run because `product_seed_refs.seed_id` is the idempotency key. Seed package rows use the import date for `first_seen_at` / `last_seen_at` because the source catalog has no reliable observation date; these fields must not be interpreted as live retail price observations.
