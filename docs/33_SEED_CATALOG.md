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

The next implementation phase should add an idempotent seed importer and only then reconcile the normalized identities with the existing production catalog. The identity schema required for brand, variant and explicit multipack metadata is now additive and documented in `docs/34_CATALOG_IDENTITY.md`.
