# Product identity matching without EAN

Status: the general identity model is still at phase 1 — no automatic merging of canonical products, ever. The Teta catalog matching (below) is implemented and writes links; it merges and deletes nothing.

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

**Scoring.** Deterministic, explainable features — brand agreement, package-size agreement, the words the two names state, conflicting variant/product-type/packaging tokens, the model number, and the margin to the runner-up candidate. No model, no probability.

**The words that decide.** A word that only one of the two names states is a difference, and the difference may be the variant ("Night" against "Day"), the shade ("černá" against "hnědá") or the flavour ("jablko" against "hruška"). A link is therefore made only when *no* distinguishing word stands on one side only — in the Teta name and in the catalog name alike. Three kinds of words are left out, because they do not tell two products of one line apart:

- the words that tie the product to something else ("pro vlasy", "s křidélky" — the packaging and the purpose are not the variant);
- the words that state the size ("200 ml") and the size number of a product line ("vel. 3") — the size is compared on its own;
- the words that name the *type* of the product ("vložky", "šampon", "krém"). A retailer may leave the type out and name the product by its line alone ("always vložky Ultra Secure Night Extra" for "Always Ultra Secure Night Extra hygienické vložky"). The types both names state do have to be compatible: "Nivea Creme" and "Nivea Deodorant" are two products. The type vocabulary is a short, hand-picked list (`lib/product-identity-teta-kinds.ts`); words that *narrow* a product ("dětská", "noční", "černá", "bio", "vanilka") are not types, because a variant that only one name states is exactly what the matching has to catch.

**Formulas.** A name can state a formula ("3 v 1", "5-in-1") that says the product does two or three things in one. The formula is read as a single word ("3in1") and compared like any other: both names have to state the same formula. "Nivea Men Active Clean 3 v 1" and "NIVEA MEN sprchový gel 3 v 1 Active Clean" are the same product, and a catalog name that states no formula is a different product — the formula is part of what the shopper buys.

**Model numbers.** The shared comparison drops pure numbers from a name, because a number is usually a package size. A *model* number is the exception — it tells two variants of a product apart ("CURAPROX CS 5460" against "CURAPROX CS 3960"). The Teta matcher reads the digits of a name that are not a package size, not a multipack count and not a percentage (`modelNumbers`): when both names state model numbers and each of them states one the other does not, the candidates are different products and the link is refused. The comparison is set-based, not "one shared number is enough": "Infaillible 24H Fresh Wear 110" and "Infaillible 24H Fresh Wear 120" share the "24" of the 24-hour hold, but the shade is what differs. A single digit is not a model number — "3D" and "5-in-1" are too common to separate two products.

**Package sizes.** The size a name states is read with the shared quantity parser, which understands the Czech thousands group: "1 000 ml" is one thousand millilitres and not a zero that is thrown away. Reading it the other way round made a pack that states its size look like a pack that states none, and the two are then not comparable at all. The two sides are also compared in the same unit: the catalog stores a package in the unit its source stated ("75 ml") where Teta stores it in litres ("0,075 l"), so the quantity is converted to the base unit of its kind (grams, millilitres, pieces) before the two are compared. Without that, two identical packages looked like two different sizes.

**A record that contradicts itself.** Teta states the content of one unit ("50 ml"), how many units the package holds ("2") and, in another attribute, how many pieces a display box holds. Two of those can be about different things, and the price and the unit price can describe a size that the package statement does not. A record whose own numbers describe two different sizes states no size that can be trusted: it is flagged (`unit-price-disagrees-with-package`), never linked automatically, and reported for review. The same holds for a record whose price is a conditional (club) price — the published unit price then belongs to that other price, not to the price the shopper pays, and the record is not a contradiction (see `docs/42_TETA_DATA_SOURCE_AUDIT.md`).

**One catalog product, one Teta SKU.** Two Teta SKUs of one product line ("… 110" and "… 120") can both look like the same catalog product. Only one of them can be that product: the one whose name fits it best keeps it, and the other one is reported for review (`resolveTetaIdentityClaims`). A catalog product that is already linked to a *different* Teta SKU is not a candidate at all.

**A product of a group of variants.** A retailer that lists a line of variants under one name says so in the name ("… (vybrané druhy)"). Such a product is not one product — its price is the price of whichever variant the retailer happens to price — so it is never linked automatically; it goes to the report.

**Auto-link only on unambiguous evidence.** A candidate is linked automatically only when the brand agrees, the package sizes agree, the two names state the same distinguishing words, no conflicting token is present, no model number contradicts, the size number of the line agrees, and the runner-up candidate is at least 0.1 behind. The runner-up is the second candidate that agrees in every respect: a candidate that is a different product is not a second opinion, it is a wrong answer, and it must not keep a correct link from being made. Everything else becomes `review_required` with the candidates and the reason, written to `data/external/teta-identity-review.json` (`pnpm product:identity-teta-catalog`). The report holds the automatic links as well, so that a human can look at the links that were made, not only at the ones that were refused.

**The product a SKU already owns is not a candidate.** The catalog product a Teta SKU is already linked to is the import's *own earlier conclusion* — and it may be the very product the import created for this SKU. Counting it again as evidence would make the decision depend on how many times the import has run: the first run would say "nothing in the catalog resembles this" and every later run would say "a perfect match". The same data, two different answers. The matcher therefore takes the product the SKU already owns out of the comparison and reports it apart (`ownProduct` in the decision), so that a human can see how well the existing link fits without it counting as a match.

**The decision is made once.** The status stored on the reference (`retailer_product_refs.identity_status`) and the product it points at stand: the import never overwrites a link it found, and never overwrites a status — not even a `review_required` one, which a human may have already looked at. A reference without a product (a run that failed half-way) is filled in. The comparison is still made on every run, because the report has to show the evidence the catalog offers today, but the *answer* that was decided when the SKU was first imported is the one that counts. A re-run therefore leaves the products, the links, the statuses and the size of the review queue exactly as they were.

**No merging, no side effects.** Canonical products are never merged or deleted; a link only sets `retailer_product_refs.productId` / `trade_items.productId` for that source's SKU. Generating candidates never writes to the database on its own — the report is a dry run.
