# Product types (druhy zboží) — concept

Status: **concept, owner-approved 2026-10-03**. Phases 0–5 are implemented (see below), except the optional
model for the long tail, which waits for an explicit owner approval. Update this document before or together with each phase.

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

Confirmed by the owner (2026-10-04): raw parts sold **marinated or seasoned** and **minced chicken**
belong to "Kuřecí maso"; parts sold **cooked** (sous-vide, roast) do not — they are ready meals.
**Offal** (liver, hearts, gizzards) and **soup parts** (backs, necks) are chicken types of their own
but not part of the group (owner, 2026-10-04, after the planner offered chicken backs as the cheapest
"Kuřecí maso"): they are offered only when a list item names them ("kuřecí játra").

### Owner decision: "Sýr"

"Sýr" on a list means everyday cheese — eidam, gouda, mozzarella, balkánský (owner, 2026-10-04).
Camembert, parmesan, processed cheese, cottage and niva are types of their own, offered when named.

### Owner decision: other meat

"Vepřové maso", "Hovězí maso" and "Krůtí maso" work the same way (owner, 2026-10-04): every raw cut
(and minced meat), never ham, salami, sausages or smoked meat.

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
| 1 | `product_types` table and code rules for the ~60–100 most common list items (from real lists and purchases), batch backfill of the catalog, golden set | **done 2026-10-04** (see below) |
| 2 | Planner uses types for items that have one | **done 2026-10-04** (see below) |
| 3 | Type/group picker on the shopping list | **done 2026-10-04** (see below) |
| 4 | Receipts and list ticking by type; receipt abbreviation dictionary; learning from corrections | **done 2026-10-04** (see below) |
| 5 | Wider coverage (109 types); optionally a model choosing from the closed list of types for the long tail, once per product, validated — **only after an explicit owner approval** (CLAUDE.md section 30) | coverage **done 2026-10-04**; model **not built** |

### Phase 1 as implemented (2026-10-04)

- **Types and groups** are code (`lib/product-types.ts`): 103 types — dairy (máslo, mléko by fat,
  smetana, jogurt, tvaroh, cheeses), eggs, bread, produce, every raw chicken / pork / beef / turkey cut,
  minced meats, šunka / párky / slanina, salmon, tuna, rice, pasta, flour, sugar, oils, salt, yeast,
  coffee, water, beer, and a few drugstore staples — and 13 groups (Kuřecí maso, Vepřové maso, Hovězí
  maso, Krůtí maso, Mleté maso, Sýr, Mléko, Smetana, Mouka, Cukr, Olej, Voda, Káva). The list came
  from common Czech shopping (the app's own lists and purchases were still too few to rank by).
- **Rules** reuse the subcategory keyword engine (word boundaries, `exclude`, `headOnly`,
  `startOnly` for produce) plus `requires` (the chicken cuts need "kuřecí"); a shared exclusion list
  removes products made from or flavoured with the thing, and for meat anything no longer raw. A name
  the subcategory rules place in another subcategory is never of the type ("Máslové sušenky").
- **Storage**: `product_types`, `product_type_groups`, `product_type_group_members` and
  `products.product_type_id` / `product_type_source` (`rule` | `manual` | `alias`), migration
  `0062_product_types.sql`, whose rows a database test compares with the code. A new product gets its
  type when ingestion or a confirmed receipt creates it; `pnpm db:assign-product-types` (dry run first)
  assigns the existing catalog and re-evaluates rule-made types after a rule change, never touching a
  manual one.
- **Golden set**: ~200 real catalog names with their expected type or "none" (`lib/product-types.test.ts`),
  fewer than the ~500 planned; it grows with each rule change. On the local catalog copy 7,259 of
  53,326 products get a type; 8 match two types (shower gel & shampoo 2-in-1) and get none.

### Phase 2 as implemented (2026-10-04)

- A list item's text is matched against a fixed set of phrases per type and group
  (`resolveListItemTypes` in `lib/product-types.ts`): the item's words, without numbers, sizes and
  plain qualifiers (bio, čerstvé, chlazené, ks, kg …), must equal one phrase in any word order —
  "Kuřecí maso", "maso kuřecí 1 kg", "vajíčka", "máslo 250g". No phrase has two meanings (tested).
- The planner (`lib/db/shopping-plan.ts`) gives such an item only products of its types
  (`getHitsForProductTypes`), the cheapest for the needed quantity (`pickTypedHit`, then unit price,
  then name). A chain without one has no offer for the item — it never falls back to text matching,
  which is what offered ham for chicken. Every other item is matched by text as before.

### Phase 3 as implemented (2026-10-04)

- `shopping_list_items.product_types` (text[], migration `0064_shopping_item_product_types.sql`) holds
  the types the household chose for an item; null means "from the name" (phase 2). The server accepts
  only known keys, at least one (`validProductTypeKeys`); null resets.
- The list (`components/shopping/shopping-list.tsx`): typing suggests the group and type names first;
  each row with a type shows it as a chip ("Kuřecí maso", "Kuřecí maso (3 z 5)"); the item's detail has
  `ItemTypePicker` — a "Druh zboží" choice (by name, a group or a type) and, for a group, its types as
  checkboxes, all ticked by default, at least one kept. An item with no type says it is searched by
  name and that results may be inexact.
- The planner takes the chosen types before the name's (`lib/db/shopping-plan.ts`).

Phases 0–5 are deterministic. Related but separate: extending the Potraviny subcategories (koření,
vejce, …), which types will sit under.

### Phase 4 as implemented (2026-10-04)

- A receipt line's type: its catalog product's (`fromProduct`), else the rules read the printed text after
  abbreviations are spelled out (`receiptTypeText`: "KUR.PRSA", "MLETÉ", "TOUST. CHLEB"); a line without a
  category is tried in every category and counts only when exactly one type fits (honesty rule).
- `matchReceiptToList`: a catalog product whose type is one the list item asks for is a certain match
  (ticked automatically); when both sides have a type it alone decides — a text-read type gives only a
  suggestion, a different type never matches ("Máslové sušenky" for "Máslo"); with no type on either side the
  earlier text matching applies. The item's types are its chosen ones, else what its name resolves to.
- Learning: a confirmed suggestion gives an untyped catalog product the item's single type (source `alias`),
  only if the type fits the product's category, its own name does not read as another type, and never over an
  existing type (`learnProductTypes`). No migration was needed.

### Phase 5 as implemented (2026-10-04)

- Six more types (kefír, cuketa, celer, čočka, med, ocet; 109 in all), migration `0065_more_product_types.sql`,
  checked against the local catalog copy and the golden set. The model for the long tail is **not built**: it
  needs the owner's explicit approval (CLAUDE.md section 30).
