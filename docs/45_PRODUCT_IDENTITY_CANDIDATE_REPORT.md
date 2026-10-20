# Product identity candidate report

Phase 2 adds a deterministic, read-only candidate report. It does not declare products identical, update product rows, merge records, or import prices.

## Run

After downloading the Teta pilot JSON to the repository's expected path:

```bash
pnpm product:identity-candidates -- --input=data/external/teta-github-pilot.json --out=data/external/product-identity-candidates-report.json
```

Options:
- `--minimum-score=0.3` — minimum score to include a pair (0–1).
- `--max-candidates=1000` — maximum output pairs, capped at 10,000.
- Input must contain `products[]` or `records[]`.

The report contains source metadata, input coverage, candidate pairs, a bounded score, component evidence, and reasons. All candidates have status `review_required`.

## Score interpretation

The score is a deterministic ranking heuristic, not a probability. It combines exact EAN agreement, normalized name-token similarity, brand and category agreement, package quantity equivalence, and potential variant-token conflicts. Missing evidence is not treated as agreement.

The current generator compares every eligible pair in the provided input. It is appropriate only for the bounded Teta pilot or other small batches; production-scale blocking/indexing is a later phase.

## Limitations

- A Teta-only pilot can only find similar records within that Teta snapshot; it cannot establish cross-retailer matches until records from other sources are supplied.
- Product names and quantities may be parsed imperfectly. Human review is mandatory.
- Variant marker list and weights are an initial heuristic and must be evaluated against labelled real pairs before being trusted.
- No scikit-learn model is trained in this phase. The report is intended to build and validate a labelled evaluation set first.
- No database writes, product merges, or price imports occur.
