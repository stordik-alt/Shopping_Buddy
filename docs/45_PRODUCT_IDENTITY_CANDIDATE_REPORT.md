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

## Conflict signals added after the first Teta pilot

- Explicit variant markers include the observed Nivea terms `diamond` and `hold`, so a matching brand/category/quantity cannot fully mask a variant conflict.
- A conservative product-kind vocabulary flags pairs such as cosmetic tissues versus tampons. Conflicting known category paths receive a stronger penalty, but are not an unconditional blocker because retailers can use different taxonomies.
- Explicit packaging terms such as `sáček` and `krabička` are reported as a conflict because packaging may define the sale unit. This vocabulary is intentionally limited and does not infer synonyms.
- These signals only lower/rank candidates and add evidence. They never auto-merge products; all outputs remain `review_required`. The vocabulary is a small pilot rule set, not a complete Czech retail ontology.

## Limitations

- A Teta-only pilot can only find similar records within that Teta snapshot; it cannot establish cross-retailer matches until records from other sources are supplied.
- Product names and quantities may be parsed imperfectly. Human review is mandatory.
- Variant, product-kind and packaging marker lists and weights are initial heuristics and must be evaluated against labelled real pairs before being trusted.
- No scikit-learn model is trained in this phase. The report is intended to build and validate a labelled evaluation set first.
- No database writes, product merges, or price imports occur.
