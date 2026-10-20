# Product identity candidate evaluation

Run the labelled-pair evaluation harness:

```bash
pnpm product:identity-evaluate -- --input=data/external/product-identity-matching-fixture.json --out=data/external/product-identity-evaluation-report.json --threshold=0.3
```

The input must contain a `pairs[]` array. Each pair has a unique `id`, `left` and `right` product records, and an `expected` label of `same_product` or `different_product`. The threshold is a score cutoff from 0 to 1: scores at or above it are predicted as `same_product` for evaluation only.

The JSON report contains per-pair predictions and the confusion matrix (TP/FP/TN/FN), accuracy, precision, recall and specificity. A metric is `null` when its denominator is zero. The evaluator does not alter the candidate generator or its `review_required` status.

## Important limitations

- The current fixture is explicitly a synthetic smoke-test fixture. Metrics from it prove only that the evaluation harness runs; they do not estimate real-world or production matching accuracy.
- Do not tune weights or threshold from this fixture alone. Build a larger, independently reviewed set of real cross-retailer pairs, including hard negatives for pack size, product type, variant and packaging, before assessing accuracy.
- Keep labelled pairs split by product family/source when comparing alternative thresholds to reduce leakage between near-duplicate examples.
- A score is a ranking heuristic, not a probability. Even a predicted `same_product` is only an evaluation label; production candidates remain human-review-only.
- The command is read-only: it writes only the requested JSON report file and does not connect to or modify the database, merge products, import prices or deploy.
