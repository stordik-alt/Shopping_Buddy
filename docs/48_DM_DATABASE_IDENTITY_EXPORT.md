# DM database export for product identity matching

Exports existing ANITKA catalog records that have an explicit `product_external_refs.source = 'dm'` row. This does not fetch dm.cz, read prices, or modify the database.

## Run

```bash
pnpm db:export-dm-identity
pnpm product:identity-candidates -- --input=data/external/dm-database-export.json --out=data/external/dm-identity-candidates-report.json
```

The export is intentionally limited to dm-linked products. It includes the internal product ID, dm-scoped external ID, name, optional brand, and existing category/subcategory. It omits prices, deals, and user data.

## Important limitations

- The legacy dm connector reads GTIN from the upstream source but does not persist it in the legacy catalog, so this export does not fabricate or infer EAN/GTIN.
- The candidate generator compares all records in one input. To compare Teta and dm, combine the DM export with the existing Teta pilot records into one JSON `products[]` array; preserve each record's `retailer` and `sourceCode`.
- Every candidate remains `review_required`; the heuristic score is not a probability and never authorizes an automatic merge.
- No product, price, deal, or identity records are written or changed.
