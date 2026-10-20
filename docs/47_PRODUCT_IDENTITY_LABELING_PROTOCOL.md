# Product identity labelled-pair protocol

## Goal

Build an independently reviewed evaluation set for the product identity candidate heuristic. This set measures how well the current score separates the same sellable product from different products. It must not be used to claim production accuracy until it contains enough real, cross-retailer examples and is reviewed consistently.

## Record format

Start from `data/external/product-identity-labelled-pairs.template.json`. Add entries to `pairs[]` with:

- `id`: stable unique ID for the labelled pair.
- `left`, `right`: source product records in the shape accepted by `ProductIdentityRecord` (retailer, sourceCode, URL, name, brand, EAN and category path where available).
- `expected`: exactly `same_product` or `different_product`.
- `reason`: concise explanation based on observable evidence.
- `syntheticRight`: set to `true` only for synthetic test examples; omit or set `false` for real source records.

Keep source URLs/codes and retailer names intact for traceability. Do not invent missing EANs, quantities, prices or attributes. Do not include customer or account data.

## Label definitions

### `same_product`

Use only when the evidence supports the same specific sellable product/variant and sale-unit quantity. Examples of relevant evidence include matching verified EAN/GTIN, matching brand and variant, equivalent normalized quantity, and compatible packaging. If packaging defines a different sale unit or the evidence is incomplete, mark the pair for adjudication rather than guessing.

### `different_product`

Use when there is evidence of a meaningful identity difference, including:

- Different quantity, unit or multipack structure.
- Different product kind (for example, tissues vs. cosmetic pads).
- Different variant/formula where the variant is part of the product identity.
- Different brand, unless reliable evidence shows it is a retailer alias/private-label mapping to the same product (do not assume this).
- Different sellable packaging where the package itself defines the sale unit.

A category-path difference alone is not enough to label a pair different because retailer taxonomies may diverge.

## Sampling rules

1. Include both likely matches and hard negatives; do not label only high-scoring pairs.
2. Sample across several product families, brands, quantities and packaging types.
3. Include pairs below the current threshold to reveal false negatives, as well as high-scoring hard negatives to reveal false positives.
4. Keep a pair-level source trace and the reason for the label.
5. Where possible, have a second reviewer independently label ambiguous pairs and resolve disagreements before inclusion.
6. Keep related near-duplicate variants together when splitting data for experiments; do not let near-identical pairs leak across tuning and holdout sets.

## Minimum useful first batch

As an initial review target (not a statistical guarantee), collect at least 100 real pairs across at least two retailers, aiming for a balanced mix of same-product pairs and hard negatives. Include products with and without EAN. Track missing fields and unresolved labels explicitly rather than forcing a decision.

## Evaluation

Run:

```bash
pnpm product:identity-evaluate -- --input=data/external/product-identity-labelled-pairs.json --out=data/external/product-identity-evaluation-report.json --threshold=0.3
```

Inspect per-pair predictions, not only aggregate metrics. Prioritize false positives because an incorrect merge could corrupt product and price history. Compare thresholds on a labelled development subset, then report results on a separate untouched holdout set. Do not tune on the holdout.

## Safety and interpretation

- Evaluation does not change the candidate generator, its `review_required` status or product data.
- Scores remain ranking heuristics, not calibrated probabilities.
- The synthetic smoke-test fixture is not a substitute for real cross-retailer labels.
- Do not automatically merge products or import prices based on evaluation predictions.
- Collection permission, source terms and provenance must be checked independently for each retailer before collecting data.
