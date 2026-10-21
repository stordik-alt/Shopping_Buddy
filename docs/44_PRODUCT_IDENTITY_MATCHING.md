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

## Teta catalog matching (2026-10-22)

`lib/product-identity-teta.ts` implements the pipeline above for one source: Teta's public catalog, matched against the products the app already knows (DM, the grocery chains, receipts).

**Blocking.** A bounded candidate set per Teta product, never a full cross product (13,360 × ~59,000 products is ~750 million pairs). The candidates come from PostgreSQL `pg_trgm`, which is already installed in the database (migration 0039) with a GIN index on the generated column `products.search_name` — the same normalized text `normalizeProductIdentityText` produces:

```sql
WHERE search_name % :normalizedName AND similarity(search_name, :normalizedName) >= 0.30
```

Eight candidates per product are kept, queried in chunks of 400 rows (a `VALUES` list against the index, one query per chunk).

**Scoring.** Deterministic, explainable features — brand agreement, package-size agreement, descriptive-word coverage of the Teta name, conflicting variant/product-type/packaging tokens, the model number, and the margin to the runner-up candidate. No model, no probability.

**Model numbers.** The shared comparison drops pure numbers from a name, because a number is usually a package size. A *model* number is the exception — it tells two variants of a product apart ("CURAPROX CS 5460" against "CURAPROX CS 3960"). The Teta matcher reads the digits of a name that are not a package size, not a multipack count and not a percentage (`modelNumbers`): when both names state model numbers and none of them is the same, the candidates are different products and the link is refused; when one of them is the same, the candidate is the stronger one. A single digit is not a model number — "3D" and "5-in-1" are too common to separate two products.

**Package sizes.** The size a name states is read with the shared quantity parser, which understands the Czech thousands group: "1 000 ml" is one thousand millilitres and not a zero that is thrown away. Reading it the other way round made a pack that states its size look like a pack that states none, and the two are then not comparable at all.

**Auto-link only on unambiguous evidence.** A candidate is linked automatically only when the brand agrees, the package sizes agree, at least 60% of the Teta name's descriptive words are found in the candidate's name, no conflicting token is present, no model number contradicts, and the runner-up candidate is at least 0.1 behind. A candidate already linked to a *different* Teta SKU is excluded. Everything else becomes `review_required` with the candidates and the reason, written to `data/external/teta-identity-review.json` (`pnpm product:identity-teta-catalog`).

**No merging, no side effects.** Canonical products are never merged or deleted; a link only sets `retailer_product_refs.productId` / `trade_items.productId` for that source's SKU. Generating candidates never writes to the database on its own — the report is a dry run.
