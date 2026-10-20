# Teta ↔ dm cross-retailer identity report

This command reads two existing JSON files and emits only cross-retailer candidate pairs. It does not connect to the database and does not change products, prices, deals, or identity records.

## Prepare the inputs

1. Export existing dm-linked catalog records with `pnpm db:export-dm-identity`.
2. Place the approved Teta pilot JSON at `data/external/teta-github-pilot.json` (or supply `--teta-input`).

## Run

```bash
pnpm product:identity-teta-dm
```

Optional arguments:
- `--teta-input=PATH`
- `--dm-input=PATH`
- `--out=PATH`
- `--minimum-score=0.3`
- `--max-candidates=1000` (hard-capped at 10,000)

The report includes per-source input counts, EAN coverage, scoring parameters, and cross-retailer candidates. Every candidate has `review_required` status. Scores are ranking heuristics, not probabilities, and never authorize automatic product merges.

## Known limitations

- The legacy dm connector does not persist GTIN in the existing product catalog; the database export therefore reports no EAN values unless a future reviewed data path supplies them.
- Product IDs and source codes are preserved as evidence but do not by themselves prove that two products are identical.
- Retailer-specific category paths may differ. Human review must check product type, variant, sale unit, and quantity.
