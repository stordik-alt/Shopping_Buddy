# Brands (značky) — concept

Status: **implemented 2026-10-06** (owner request and decisions of the same day).

## 1. Problem

A product name often says only who made it: "ORION STUD.PECET" or "MADETA JIH." on a receipt, "Kubík
jahoda" in a catalog. The keyword rules (`lib/product-subcategories.ts`) look for what the product
*is* ("čokoláda", "máslo") and either find nothing or are misled by a flavour word — "Kubík jahoda" is
a drink, not a strawberry; "Milka čokoláda mléčná" is a sweet, not dairy. The owner: *"Může se i
rozpoznávat podle brandu, značky. Například Orion vyrábí čokoládu a sladkosti. Jupík, Kubík, Yess —
všechno jsou nápoje pro děti. Můžeme se tedy řídit i firmou, značkou, která to vyrábí."*

Before this, only a short hard-coded list of drink brands existed, used for the subcategory only.

## 2. Owner decisions (2026-10-06)

- Children's drinks — **Jupík, Kubík, Yess** — belong to **Děti ▸ Dětské nápoje**, not to Potraviny ▸
  Nápoje with a tag (this replaces the 2026-09-28 rule "Kubík stays Potraviny ▸ Nápoje").
- **Yess** is Dobrá voda's line for children and is entirely a children's drink; plain **Dobrá voda**
  stays Potraviny ▸ Nápoje.
- The first brand list is compiled by Claude and checked against the real catalog; the owner extends it.

## 3. Model

`lib/product-brands.ts` holds the brand dictionary, in code like the keyword rules, versioned and
unit-tested. Each brand has its spellings, an **item category**, optionally a **subcategory**, and:

- `decides` — the brand makes one kind of goods (Kubík, Kofola, Milka, Lindt, Teekanne): its
  subcategory beats the keyword rules;
- otherwise the brand makes several kinds within its category (Madeta, Opavia, Emco): the keyword rules come first and the brand places only what they leave unplaced;
- `atStart` — the brand is also an ordinary word (Relax, Toma, Hello, Rama): it counts only as the
  first word of the name;
- `exclude` — words for which the name is not the brand's goods: ORION kitchenware ("nůž", "sítko"),
  Relax sunglasses, Müller-Thurgau wine, Dr. Müller pharmacy goods, a mixed drink with Coca-Cola, a
  sweets brand's ice cream or drink (left to the keyword rules: frozen food, drinks).

Matching is by whole words in the normalized name. When several brands appear, the one **earliest in
the name** wins ("Jacobs Milka Cappuccino" is coffee); at the same position the longer spelling wins
("Dobrá voda YESs" is Yess). A grown-up brand's **children's line** ("NIVEA Kids", "elmex Junior",
words baby / kids / junior / dětský / kojenecký) gets nothing from the brand — other evidence decides.
And a grown-up brand **never takes a product out of Děti** (`categoryWithBrand`, 2026-10-06): a retailer that files
"Balea sprchový gel Surfosaurus" among children's goods knows it is the brand's children's line even when the name
does not say so. This holds for receipt lines, new products and the `db:brand-categories` batch alike.

Some brands make too many kinds of goods to name a subcategory (Vitana, Dr. Oetker, Hamé, Knorr, Maggi, Podravka,
Lipton, Balea, ebelin, Profissimo, Denkmit): they give only the item category, which a receipt line's reader may
not.

## 4. Where brands are used

- **Subcategory** (`classifySubcategoryByKeyword`): as above. A branded name is never raw produce. A
  children's drink brand classified under Potraviny still gives "Nápoje".
- **Receipt lines** (`resolveItemPlacement` in `lib/receipts.ts`): a catalog product's own category
  first; then the brand's category; then the receipt reader's guess. A line the brand places no longer
  needs review for its category.
- **New catalog products** (`resolveOrCreateProductFromExternal`): the brand's category over the
  retailer's (Rohlík files Kubík under groceries).
- **Existing catalog**: `pnpm db:brand-categories` (dry run; `--apply` writes) moves products to their
  brand's category with the subcategory the rules give, purchase lines (with the budget split) and the
  pantry rows that sat in the old category. Never a product an administrator locked or a household
  moved by hand. Then `pnpm db:reclassify-products` re-places subcategories within categories.
- **Pantry**: children's food and drinks (a Děti subcategory that is food) go to Spíž, or Lednice when
  the name says so — no longer to Domácnost.
- **Child-oriented tag**: every product of a Děti brand.

## 5. Measured on the local catalog copy (53,326 products, 2026-10-06)

The 127 brands recognise 8,189 products. 3,439 get a subcategory they did not have; 201 move to
another category (186 Potraviny → Děti: Kubík 58, Jupík 26, Yess 9, HiPP, Sunar, Hami …; 12 Potraviny →
Drogerie, e.g. a misfiled Colgate). Typical corrected misplacements: 80 Milka and 70 Lindt chocolates
from Mléčné výrobky to Sladkosti; Relax, Rauch, Hello juices from Ovoce a zelenina to Nápoje.

## 6. Second round (2026-10-06)

37 more brands (164 in all) — drinks (San Pellegrino, Caprio, Granini, FuzeTea, Nestea, Powerade, 7UP, Capri-Sun,
DrWitt, Ovocňák, Granko), Strongbow, JoJo, Pom-Bär, Wasa, Gervais, Nice Bites, household paper (Tento, Zewa),
Spontex, drugstore (Bellinda, Visiomax, Terezia) and the category-only food and dm brands above — each checked
against the catalog first. Left out on purpose: Mivolis (sells sweets and protein too), Bonduelle (vegetables — the
brand would switch the produce rule off), Monte, Saloos, Sundance (too mixed), Rio (juices and Rio Mare tuna).

## 7. Applied to production (2026-10-06)

`db:brand-categories --apply` moved 200 products; `db:reclassify-products --apply` then re-placed
2,125 products, 9 purchase lines and 2 pantry rows.

## 8. Not done

- No brand column on `products` — the brand is derived from the name each time (pure, cheap). Storing
  it is worth doing once something needs to filter by brand in the database.
- The list grows by hand; there is no learning of new brands.
