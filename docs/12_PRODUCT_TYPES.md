# Product types (druhy zboží) — concept

Status: **concept, owner-approved 2026-10-03**. Phase 0 is implemented (see below); phases 1–5 are
not built yet. Update this document before or together with each phase.

## 1. Problem

A shopping-list item is free text ("Máslo", "Kuřecí maso"), and the shopping planner and product
search find products for it by matching words in their names (`lib/product-search.ts`: word stems,
derived words, linking words). Text cannot say *what kind of product* something is. Checked against
the real catalog (53,326 products, 2026-10-03), the planner offered for example:

| List item | Offered | Why text matching fails |
|---|---|---|
| Kuřecí maso | "Kuřecí šunka (92% masa)" | "masa" in a parenthesis counted as the word "maso" |
| Kuřecí maso | — "Kuřecí prsní řízky" never found | real chicken meat does not say "maso" in its name |
| Rýže | "Radegast Ryze hořká 12 pivo" | a brand word equals the item word |
| Banány | "ORION Banány želé v čokoládě" | the item word is there, the product is a sweet |
| Vejce | "Vejce v aspiku", "Kinder vejce s překvapením" | same |
| Mléko | "Kefírové mléko", "Mléko kondenzované" | a different dairy product sharing the word |
| Jablka | "Granátové jablko" | a different fruit sharing the word |

The owner's requirement: **for "Máslo" offer only butter; for "Kuřecí maso" only chicken itself — and
the same for every product.**

Subcategories (`lib/product-subcategories.ts`) do not solve it: they are too coarse ("Maso a
uzeniny" holds chicken breast and ham alike) and only 42 % of products have one.

## 2. Model

A product type sits between what the household wants and what a retailer sells:

```text
Group      Kuřecí maso (syrové)            — what a list item may ask for
  Type       Kuřecí prsa | Kuřecí stehna | Kuře celé | …   — a stable identity
    Product    "Vodňanské kuře prsní řízky 500 g" (Billa)  — existing `products` row
```

- **Type**: one kind of goods a shopper treats as interchangeable apart from brand, size and price
  ("Máslo", "Kuřecí prsa", "Mléko polotučné"). Each type has a category and subcategory, and a
  comparable unit (kg, l or ks) for unit-price comparison (CLAUDE.md section 17).
- **Group**: a named set of types a list item can ask for at once ("Kuřecí maso"). A type may belong
  to several groups.
- **Product**: an existing catalog row; it gets at most one type.

### Owner decision: "Kuřecí maso"

"Kuřecí maso" means **every part of the chicken, and never a product made from chicken meat**
(owner, 2026-10-03). Included: whole chicken and halves, breast (with or without bone/skin), breast
fillets/schnitzels, thighs, upper and lower thighs (drumsticks), quarters, wings, and other raw parts.
Excluded: ham, salami, sausages, nuggets, smoked or cooked products, ready meals, baby food.

Open, to confirm when the chicken types are defined: raw parts sold marinated or seasoned, minced
chicken, offal (liver, hearts, gizzards), and raw parts sold cooked sous-vide.

## 3. Assigning a type to a product

Rules live in code (like the subcategories), are versioned and unit-tested. For each type:

- **head word(s)**: the noun that names the product, matched with the existing word-form rules
  ("máslo"; "prsa" / "prsní řízek");
- **required category/subcategory**: butter only in Potraviny → Mléčné výrobky; this alone removes
  cosmetics ("Balea máslo na nohy");
- **exclusion words**: shared ones for products made from something (šunka, salám, párky, pomazánka,
  sušenky, želé, polévka, hotové jídlo, příkrm, krmivo, …) plus the type's own ("arašídové",
  "bylinkové" for butter; "kefírové", "kondenzované" for milk);
- **plausible package and unit**: butter 100–1000 g; chicken breast priced per kg.

A product matching no type, or more than one, stays **without a type and is never offered
automatically** — the same honesty rule the planner already follows ("Polévka s vejcem" is never
offered for eggs).

Storage: `products.product_type_id` plus the assignment's source (`rule`, `manual`, `alias`) and
confidence; a manual correction is never overwritten by a rule. Types are assigned when ingestion
creates a product, and once for the existing catalog by a batch backfill. Storage cost is a few MB.

## 4. Where types are used

- **Shopping planner**: a list item with a type or group compares only products of those types, by
  normalized unit price (Kč/kg, Kč/l). For "Kuřecí maso" that is the cheapest kilo of any chicken
  part the household allows, never ham.
- **Shopping list**: typing suggests types and groups; a group shows its types as checkboxes (default:
  all of them). Free text stays possible; its type is derived through synonyms, and without one the
  current text matching applies, marked as uncertain.
- **Receipts**: a receipt line resolved to a catalog product (alias, exact or fuzzy match) takes that
  product's type; an unknown line is classified by the same rules plus a dictionary of receipt
  abbreviations ("KUR.PRSA", "TOUST. CHLEB"). Ticking the list from a receipt compares types instead
  of text. A household's correction is remembered.

## 5. Quality

A golden set of ~500 real catalog names with their expected type (or "none") is part of the tests;
every rule change is measured on it, so fixing one type cannot silently break another.

## 6. Phases

| Phase | Content | State |
|---|---|---|
| 0 | `isDirectMatch` ignores parentheses and rejects names whose leading words name another product (šunka, pivo, želé, smoothie, krmivo, …) or contain "v aspiku" / "s překvapením" / "set k přípravě" | **done 2026-10-03** |
| 1 | `product_types` table and code rules for the ~60–100 most common list items (from real lists and purchases), batch backfill of the catalog, golden set | — |
| 2 | Planner uses types for items that have one | — |
| 3 | Type/group picker on the shopping list | — |
| 4 | Receipts and list ticking by type; receipt abbreviation dictionary; learning from corrections | — |
| 5 | Wider coverage; optionally a model choosing from the closed list of types for the long tail, once per product, validated — **only after an explicit owner approval** (CLAUDE.md section 30) | — |

Phases 0–4 are deterministic. Related but separate: extending the Potraviny subcategories (koření,
vejce, …), which types will sit under.
