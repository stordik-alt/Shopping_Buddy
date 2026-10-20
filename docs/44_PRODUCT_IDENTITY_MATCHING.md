# Product identity matching without EAN

Status: phase 1 foundation; no production matching, automatic merging, or database writes.

## Goal

ANITKA must identify concrete products even when EAN/GTIN is missing. Every canonical ANITKA product has a stable internal ID. Retailer records are separate source identities and must never be identified by retailer SKU alone across chains.

## Identity layers

1. **Canonical product** — ANITKA's stable ID for a concrete product identity.
2. **Retailer product identity** — (retailer, retailer_product_code) plus source URL and observation timestamps. Codes are only unique within their retailer/source scope.
3. **Pack/variant identity** — brand, normalized product name, variant/formula, quantity, unit and multipack composition.
4. **EAN/GTIN** — optional corroborating identifier. It is not required to create or match a product.

## Matching pipeline

1. Normalize text consistently (Unicode normalization, case folding, diacritic-insensitive comparison, punctuation/whitespace cleanup). Do not remove or rewrite digits.
2. Parse package quantity and multipack structure separately from the name. Never infer a missing quantity.
3. Generate a bounded candidate set using category/brand and text similarity; do not compare every catalog row against every other row.
4. Compute explainable pair features: name similarity, brand agreement, category agreement, variant token agreement, quantity/unit agreement, multipack agreement, and optional exact GTIN agreement.
5. Score candidates with deterministic rules first. A future scikit-learn classifier may rank candidates after a labelled evaluation set exists; its score is not a probability until calibrated and evaluated.
6. Return one of "auto_match_candidate", "review_required", "no_match", or "conflict". Phase 1 does not implement automatic acceptance.

## Non-negotiable safeguards

- Different package quantities or multipack composition are a conflict unless a verified pack-conversion relationship explicitly allows comparison.
- Product variant/formula differences are not erased by high name similarity.
- A missing brand or quantity is unknown, not agreement.
- Prices and promotions attach to a retailer offer/observation, not to the canonical identity by themselves.
- Every proposed link records method/version, evidence/features, source records, timestamp, and review status.
- Never merge canonical products or write to production as a side effect of candidate generation.

## Initial evaluation fixture

The file data/external/product-identity-matching-fixture.json is a small, hand-labelled smoke-test fixture. Synthetic counterparts are deliberately synthetic and are not claims about another retailer's live catalog. It checks spelling/format normalization and hard negatives such as quantity and variant differences. It is not large enough to train or validate a machine-learning model.

## Next phases

- Phase 2: candidate generation and pair-feature export in a read-only JSON/CSV report.
- Phase 3: collect human-confirmed positive and negative pairs across real sources.
- Phase 4: evaluate RapidFuzz + TF-IDF features and scikit-learn classifiers against a held-out set; report precision/recall and false merges.
- Phase 5: only after review, consider a guarded persistence path and operational monitoring.
