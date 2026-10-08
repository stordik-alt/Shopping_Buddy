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

## 7. Hlavní koncept: Product Knowledge Dictionary a externí taxonomie

**Schváleno vlastníkem 2026-10-08.** Toto je hlavní dlouhodobý koncept pro rozšiřování znalosti o druzích zboží. Aplikace nesmí být závislá pouze na ručně udržovaných pravidlech v `lib/product-types.ts`. Ruční pravidla zůstávají aplikační bezpečnostní a korekční vrstvou, ale vlastní znalost o produktech bude postupně soustředěna do verzované znalostní vrstvy **Product Knowledge Dictionary (PKD)**.

Cíl není vytvořit pouze větší seznam názvů. PKD musí popsat **co produkt je, co není, jaké má varianty, v jakých formách a baleních se prodává a jak se jeho množství převádí na společnou jednotku**.

### 7.1 Zdrojová strategie

Použijeme kombinaci zdrojů s odlišnými úlohami:

1. **GS1 GPC** — hlavní strukturální referenční taxonomie. GPC používá hierarchii Segment → Family → Class → Brick a atributy; aktuální veřejně publikovaná verze k 2026-10 je **2026-05**. GPC je vhodná jako globální klasifikační kostra, nikoli jako seznam českých nákupních názvů.
2. **Open Food Facts** — praktický zdroj skutečných potravinových názvů, kategorií, synonym, značek, variant a dalších vlastností. Je důležitý hlavně pro potraviny a pro tvorbu slovníku reálných označení.
3. **CZ-CPA 2025 / CPA Ver. 2.2** — český referenční klasifikační zdroj pro kontrolu významu a pokrytí produkce. Není hlavní nákupní taxonomií aplikace; její účel je validační a mapovací.

Zdrojové taxonomie se **nesmějí nekontrolovaně propsat přímo do `product_types`**. Externí klasifikace je znalostní vrstva, interní Product Type je stabilní aplikační identita.

> Poznámka: žádný jednotlivý veřejný zdroj negarantuje kompletní seznam všech maloobchodních druhů zboží. „Všechny druhy“ proto v tomto konceptu znamená maximální dosažitelné pokrytí pomocí kombinace zdrojů, normalizace, synonym, atributů, nových kandidátů a průběžné aktualizace — ne tvrzení, že jeden katalog obsahuje absolutně všechny produkty na trhu.

### 7.2 Product Knowledge Dictionary

PKD bude obsahovat normalizované znalostní záznamy oddělené od konkrétních SKU.

Minimální znalostní záznam:

- stabilní interní ID,
- český kanonický název,
- alternativní názvy a synonyma,
- jazykové varianty a morfologické tvary,
- nadřazený typ / skupina,
- kategorie a podkategorie,
- externí ID a mapování (GPC, OFF, CZ-CPA podle dostupnosti),
- definice hranic druhu,
- `contains` — co do druhu patří,
- `excludes` — co do druhu nepatří,
- varianty a významné atributy,
- fyzická forma produktu,
- stav zpracování (raw, cooked, dried, frozen, pickled, canned, prepared atd.),
- typickou prodejní jednotku,
- typické velikosti balení,
- pravidla převodu množství,
- rozpoznávací pravidla,
- příklady skutečných názvů produktů,
- zdroj, verzi zdroje a datum importu,
- confidence,
- stav mapování na interní Product Type,
- případnou ruční korekci.

### 7.3 Druh zboží není totéž co varianta, forma ani balení

Tyto pojmy musí zůstat oddělené:

```text
Product Type
  └── Variant / attributes
        └── Form / processing state
              └── Package / selling unit
                    └── Concrete retailer product / SKU
```

Příklad:

```text
Kuřecí prsa
  → bez kosti
  → s kůží
  → chlazená
  → 500 g
  → "Vodňanské kuře prsní řízky 500 g"
```

Balení **nesmí vytvářet nový Product Type** jen proto, že se stejný druh prodává jako 250 g, 500 g, 1 kg, 2 × 500 g, multipack nebo kusové balení.

Naopak skutečně významná změna produktu (např. syrové kuřecí maso vs. vařený výrobek, čerstvé houby vs. nakládané houby) může znamenat jiný Product Type nebo jinou hranici skupiny.

### 7.4 Univerzální model množství a balení

Pravidla převodu musí platit **pro všechny druhy zboží**, nikoli pouze pro potraviny.

Každý produkt má mít podle dostupných dat:

- `quantity_value`,
- `quantity_unit`,
- `package_count`,
- `package_type`,
- `drained_quantity` (pokud je relevantní),
- `net_quantity`,
- `base_unit`,
- `conversion_method`,
- `conversion_confidence`.

Příklady:

| Prodejní forma | Normalizace |
|---|---|
| 500 g | 0,5 kg |
| 2 × 500 g | 1 kg |
| 6 × 330 ml | 1,98 l |
| 1,5 l | 1,5 l |
| 10 ks | 10 ks |
| 3 balení po 250 g | 0,75 kg |
| 4 role | 4 ks |

Základní pravidlo:

**Převádíme pouze to, co je skutečně matematicky nebo deklaratorně převoditelné.**

Nesmí se například předpokládat, že 1 balení = 1 kg, 1 láhev = 1 l nebo 1 krabička = 1 ks obsahu. Pokud chybí bezpečný převod, systém zachová původní jednotku a označí množství jako neporovnatelné.

Převody budou rozděleny na:

1. **přímé převody jednotek** — g ↔ kg, ml ↔ l, ks,
2. **deklarované multipacky** — počet × množství,
3. **obalové převody** — např. „3 role“, pouze pokud je role pro daný typ skutečně základní prodejní jednotkou,
4. **odvozené převody** — pouze z ověřeného atributu nebo zdroje,
5. **neznámé převody** — nikdy se neodhadují bez evidence.

Převodní pravidla budou verzovaná a auditovatelná. Každý výsledek musí být možné vysvětlit zdrojem a metodou.

### 7.5 Kanonická jednotka pro porovnávání

Product Type může definovat `comparison_unit`:

- hmotnost → kg,
- objem → l,
- počet → ks,
- délka → m,
- plocha → m²,
- jiné veličiny pouze tehdy, pokud dávají pro daný typ obchodní smysl.

Cena za jednotku se počítá až z normalizovaného množství. Pokud normalizace není bezpečná, produkt se nesmí označit jako levnější pouze na základě odhadu.

Tím se sjednotí:

- nákupní plán,
- akce,
- sklad,
- rozpočty,
- receptové množství,
- převody balení,
- porovnávání cen mezi řetězci.

### 7.6 Mapování externích taxonomií na interní Product Types

Tok dat:

```text
GS1 GPC
   + Open Food Facts
   + CZ-CPA
   + vlastní katalog produktů
   + OCR / účtenky
          ↓
normalizace názvů a atributů
          ↓
Product Knowledge Dictionary
          ↓
hranice / synonymum / forma / balení / jednotka
          ↓
mapování na interní Product Type
          ↓
products
          ↓
nákupní seznam / plánování / zásoby / účtenky / AI
```

Externí klasifikace může být mnohem podrobnější než aplikační model. Více externích položek proto může mapovat na jeden interní Product Type.

Opačně není dovoleno vytvořit interní Product Type pouze proto, že externí zdroj obsahuje nový klasifikační kód. Nový interní typ vzniká až po splnění interní definice a pravidel.

### 7.7 Dlouhý ocas a kandidátní druhy

Dosavadní model má 109 interních typů. To není konečný seznam.

Importy budou vytvářet také **candidate product types** pro případy, které:

- jsou opakovaně přítomné v katalozích,
- nelze bezpečně namapovat na existující typ,
- mají dostatečně jednoznačnou definici,
- nebo jsou významné pro český maloobchod.

Kandidát není automaticky platným interním typem.

Každý kandidát musí projít:

1. normalizací,
2. deduplikací,
3. kontrolou hranic,
4. kontrolou proti externím taxonomiím,
5. kontrolou konfliktů s existujícími typy,
6. určením základní jednotky a balení,
7. testem na skutečných produktech,
8. schválením nebo zamítnutím.

### 7.8 AI klasifikace

AI může pomáhat s klasifikací dlouhého ocasu, ale nesmí vytvářet nekontrolované aplikační identity.

AI dostane uzavřený seznam platných interních Product Types a může vrátit:

- existující Product Type,
- kandidátní Product Type,
- nebo `none / unknown`.

Každá AI klasifikace musí mít:

- vstupní text,
- vybraný typ,
- confidence,
- vysvětlení / evidence,
- verzi modelu,
- verzi PKD,
- možnost zpětné korekce.

AI nesmí obejít pravidla `excludes`, kategorii, formu, stav zpracování ani bezpečnost převodů balení.

### 7.9 Aktualizace znalostní vrstvy

PKD bude importovatelná a verzovaná datová vrstva.

Každý import musí evidovat:

- zdroj,
- verzi zdroje,
- datum získání,
- počet nových záznamů,
- počet změněných záznamů,
- počet odstraněných / neaktivních záznamů,
- počet kandidátů,
- počet úspěšných mapování,
- počet konfliktů,
- počet duplicit,
- chyby validace.

Aktualizace zdrojů nesmí přímo měnit ruční korekce ani přepsat ručně schválené mapování.

### 7.10 Deduplikace a identita

Synonyma, pravopisné varianty, různé názvy stejného druhu a stejné produkty z více zdrojů se nesmějí stát samostatnými Product Types.

Identita musí být oddělena od názvu:

```text
stable_id ≠ canonical_name ≠ synonym ≠ retailer_product_name
```

Změna názvu v externím zdroji tedy nesmí rozbít interní vazby.

### 7.11 Bezpečnostní pravidla

Platí následující pravidla:

- nejasný produkt = `unknown`, nikoli náhodný typ,
- více možných typů = `unknown` nebo kandidát, nikoli libovolný výběr,
- ruční korekce má přednost před automatickým pravidlem,
- bezpečný převod má přednost před odhadem,
- externí klasifikace je důkaz / pomocný signál, nikoli automatické rozhodnutí,
- změna PKD nesmí zpětně změnit ruční klasifikaci,
- každý automatický výsledek musí být reprodukovatelný z verze pravidel a dat.

### 7.12a Stav PKD schema — 2026-10-08

### 7.12b Stav Quantity & Packaging Dictionary — 2026-10-08

Navazující databázová vrstva nyní obsahuje univerzální slovník množství a balení pro **všechny druhy zboží**:

- `quantity_units` — rozměrové jednotky a jejich kanonická jednotka,
- `quantity_conversions` — pouze explicitně evidované bezpečné převody s metodou, zdrojem, verzí a confidence,
- `packaging_types` — slovník typů prodejních obalů/jednotek.

Základní jednotky jsou `ks`, `kg`, `l`, `m` a `m2`; podporovány jsou také jejich relevantní menší metrické jednotky. Převod hmotnosti, objemu, délky nebo plochy je možný pouze mezi jednotkami stejné dimenze.

Datový model záměrně **neobsahuje automatický převod obal → obsah**. Například `láhev`, `krabička`, `balení` nebo `role` samy o sobě neříkají, kolik produktu obsahují. Obsah musí být deklarovaný nebo ověřený.

Migration: `0078_quantity_packaging_dictionary.sql`. Tato fáze nemění existující `product_packages` ani katalogové produkty.


První databázová vrstva PKD je nyní připravena jako samostatná znalostní vrstva:

- `pkd_sources` — verzované zdroje a metadata importu,
- `pkd_entries` — stabilní znalostní identity s kanonickým názvem, kategorií, formou, stavem zpracování, atributy, hranicemi a confidence,
- `pkd_synonyms` — oddělená synonyma a normalizované tvary,
- `pkd_external_mappings` — explicitní vazby na externí ID a jejich důkazy/confidence.

Migration: `0077_product_knowledge_dictionary.sql`. Drizzle model je v `lib/db/schema.ts`.

PKD zatím **neimportuje žádný externí zdroj** a nemění automaticky katalog. Tato změna pouze vytváří bezpečný datový základ pro další kroky. Mapování na interní `product_types` je volitelné a FK je nastavené tak, aby odstranění interního typu odstranilo pouze vazbu, nikoli znalostní záznam.
### 7.12 Implementační pořadí

Další práce bude probíhat v tomto pořadí:

1. **PKD schema** — databázový model pro druhy, synonyma, atributy, externí mapování a zdroje.
2. **Quantity & Packaging Dictionary** — jednotky, balení, multipacky a bezpečné převody.
3. **Import GS1 GPC** — strukturální základ a verzování.
4. **Import Open Food Facts** — názvy, kategorie, synonyma a potravinové atributy.
5. **Import CZ-CPA** — česká kontrolní a mapovací vrstva.
6. **Normalization + deduplication** — sjednocení zdrojů.
7. **Candidate generation** — hledání dosud nepokrytých druhů.
8. **Mapping engine** — mapování PKD → interní Product Types.
9. **Backfill katalogu** — opětovné vyhodnocení existujících produktů.
10. **Golden set / regression tests** — měření přesnosti a ochrana proti regresím.
11. **AI long-tail classifier** — až po stabilizaci uzavřeného interního seznamu.
12. **Pravidelné aktualizace** — automatizované importy a report změn.

### 7.12c Stav Quantity Normalization Engine — 2026-10-08

Existující `product_packages` jsou nyní napojeny na univerzální PKD model pomocí polí `base_unit`, `conversion_method`, `conversion_confidence`, `net_quantity`, `net_unit`, `drained_quantity` a `drained_unit`.

Nový `lib/quantity-normalization.ts` poskytuje deterministické operace:

- převod pouze mezi jednotkami stejné dimenze,
- kanonizaci na `kg`, `l`, `ks`, `m` nebo `m2`,
- ověření deklarovaného multipacku bez dvojího započtení celkového množství,
- `unknown` místo odhadu při neúplných nebo rozporných datech.

Stávající `product_packages.quantity` zůstává celkovým množstvím spotřebitelského balení. `packageCount × packageUnitQuantity` se používá pouze jako důkaz konzistence. Název obalu sám o sobě nikdy nevytvoří množství.

Migration: `0079_product_package_quantity_normalization.sql`.
### 7.12d Stav GS1 GPC importu — 2026-10-08

GS1 GPC je používáno jako externí strukturální taxonomie PKD. Aktuální oficiální publikace je **2026-05**; GS1 publikuje GPC schema v Excel/XML formátu a GPC Browser obsahuje také překlady. citeturn0search1turn0search0

První ingestion vrstva:
- `scripts/import-gs1-gpc.ts`
- `lib/pkd-gpc-parser.ts`
- příkaz `pnpm db:import-gpc -- --file=/path/to/gpc.xml` je ve výchozím režimu dry-run,
- `--apply` zapíše data do `pkd_sources`, `pkd_entries` a `pkd_external_mappings`,
- verze je explicitně verzovaná (`GPC_VERSION`, výchozí `2026-05`),
- GPC kódy jsou uloženy jako externí identita; import automaticky nevytváří interní `product_types`.

Import je navržen jako idempotentní upsert. Hierarchie Segment → Family → Class → Brick zůstává v `attributes` a `externalParentId`, aby bylo možné později provést samostatné mapování na interní Product Types.

### 7.12e Stav Open Food Facts importu — 2026-10

Open Food Facts je použito jako externí znalostní a kandidátní vrstva, nikoli jako automatický zdroj interních Product Types. Aktuální API dokumentace uvádí v3 jako doporučené API; pro rozsáhlé dávky Open Food Facts doporučuje použít datový export místo masivního dotazování API. Taxonomie je vícejazyčná a podporuje kanonické tagy, překlady a hierarchii.

První ingestion vrstva importuje **categories taxonomy** z JSON exportu:
- `scripts/import-open-food-facts.ts`
- `lib/pkd-off-parser.ts`
- `pnpm db:import-off -- --file=/path/to/categories.json` je ve výchozím režimu dry-run,
- `--apply` zapisuje do `pkd_sources`, `pkd_entries`, `pkd_synonyms` a `pkd_external_mappings`,
- `OFF_VERSION` a `OFF_LANGUAGE` jsou explicitně verzované/nastavitelné,
- OFF category/tag identity zůstává externí; import automaticky nevytváří interní `product_types`,
- synonyma se ukládají odděleně a normalizovaně,
- rodiče a děti zůstávají v `attributes` a první rodič také v `externalParentId`.

Záměrně se v této fázi **neimportuje celý produktový katalog Open Food Facts**. OFF uvádí, že data jsou dobrovolně dodávaná a nemusí být přesná, úplná nebo spolehlivá; proto jsou zde použita jako znalostní evidence a kandidátní signál, nikoli jako autoritativní klasifikace.

### 7.12f Stav CZ-CPA importu — 2026-10-08

CZ-CPA 2025 je použito jako česká kontrolní a mapovací vrstva PKD. ČSÚ aktuálně zveřejňuje opravenou systematickou část a klasifikaci **CZ-CPA_2025_KL** ve formátech XML, CSV a XLSX; klasifikace má šest úrovní (číselníky 6501–6506). citeturn1view0turn2search0

První ingestion vrstva:
- `scripts/import-cz-cpa.ts`
- `lib/pkd-cz-cpa-parser.ts`
- `pnpm db:import-cz-cpa -- --file=/path/to/cz-cpa.csv` je ve výchozím režimu dry-run,
- `--apply` zapisuje do `pkd_sources`, `pkd_entries` a `pkd_external_mappings`,
- `CZ_CPA_VERSION` a `CZ_CPA_LANGUAGE` jsou explicitně nastavitelné,
- podporovány jsou JSON, CSV a XML exporty; XLSX se předává přes CSV/XML export z oficiálního zdroje,
- kódy úrovní 1–6 jsou zachovány jako externí identita,
- rodič, cesta a úroveň jsou uloženy v `attributes` a rodič také v `externalParentId`,
- import automaticky nevytváří interní `product_types`.

CZ-CPA je zde záměrně **validace/mapování**, nikoli retailový Product Type katalog. Název položky ani klasifikační kód proto samy o sobě nemění interní klasifikaci produktu. ČSÚ zároveň upozorňuje na probíhající legislativní opravy českých názvů, takže zdrojová verze a provenance musí zůstat součástí PKD. citeturn1view0

### 7.12m Kvalita kandidátů PKD — 2026-10-09

Generátor kandidátů je verzován jako `2026-10-v4`. Cílem je předložit k ručnímu posouzení použitelné identity, ne maximalizovat počet návrhů.

- Zjevné názvy skupin/taxonomických kategorií a balíčků (např. „Slazené nápoje“ nebo „Variety packy svačin“) se nenavrhují jako jednotlivý Product Type.
- Název se nikdy automaticky nepřevádí na kategorii ani porovnávací jednotku jen podle domněnky. Chybějící hodnoty zůstávají `null` a objeví se ve `reviewFlags`.
- Každý kandidát nese `reviewFlags`, např. `single_source`, `category_unknown`, `comparison_unit_unknown`, `possible_region_or_named_variant` a `no_approved_source_entry`. Jsou to upozornění pro review, nikoli automatické zamítnutí.
- Confidence je konzervativní důkazní skóre: jediný zdroj bez explicitní kategorie/jednotky nedostane vysoké skóre. Není to pravděpodobnost správnosti ani schválení.
- Náhled i výpis uložených kandidátů zobrazují `reviewFlags`, aby šlo slabé a regionálně/variantně specifické návrhy odhalit před schválením.
- Filtr je záměrně úzký; nejednoznačné názvy zůstávají k lidskému posouzení. Nedochází k automatickému vytváření kategorií, jednotek ani Product Types.

### 7.12h Stav PKD candidate generation — 2026-10-09

Generování nových druhů bylo zpřesněno, protože samotný počet kandidátů bez konkrétních názvů a zdrojů nebyl použitelný.

- Kandidát znamená návrh **nové interní Product Type identity**, nikoli pouze návrh vazby na existující druh.
- Identita je deterministická: `language + normalizedName`; ekvivalentní záznamy se seskupí a zachovají se všechna zdrojová ID. Velikost písmen, diakritika a interpunkce nevytvářejí novou identitu (např. `PAPRIKA`, `Paprika`, `paprika`).
- Přímé návrhy pro český katalog vznikají z českých koncových kategorií Open Food Facts a z českých záznamů vlastních, seed a OCR zdrojů.
- GS1 GPC a CZ-CPA slouží v této fázi jako referenční taxonomie, nikoli jako přímé návrhy retailových druhů. Záznamy OFF s potomky se také nenavrhují jako samostatný druh.
- Záznam, který už má kandidátní nebo schválenou vazbu na existující Product Type, se nesmí zároveň navrhovat jako nový druh. Zamítnuté a neaktivní záznamy se vynechávají.
- Dry-run nyní vypisuje konkrétní návrhy (název, normalizovaný název, zdroj, počet zdrojových záznamů, kategorii, jednotku, confidence a candidate key), ne pouze počet. Počet zobrazených návrhů lze změnit přes `--limit=100`.
- `confidence` je pouze důkazní signál; není automatickým schválením ani tvrzením, že typ je správně definován.
- Runner: `pnpm db:generate-pkd-candidates` (dry-run s náhledem), `pnpm db:generate-pkd-candidates -- --apply` (zápis návrhů).
- Workflow `PKD candidate generation` je manuální přes `workflow_dispatch`; nejprve se spouští bez `apply`, aby bylo možné zkontrolovat konkrétní výsledky.

#### Schválení nového druhu

- Workflow `PKD Product Type candidate approval` je manuální a ve výchozím režimu pouze ověřuje kandidáta.
- Schválení vyžaduje explicitní interní kategorii a porovnávací jednotku; stabilní `key` se vytvoří z normalizovaného názvu nebo jej lze dodat ručně.
- Teprve při `apply=true` vznikne záznam v `product_types`, zdrojové PKD entries se propojí přes `product_type_id` a kandidát se označí jako `accepted`.
- Schválení se odmítne, pokud kandidát není v češtině, nemá dohledatelné zdroje, zdroj už má přiřazený druh, koliduje klíč nebo již existuje Product Type se stejným normalizovaným názvem (bez ohledu na velikost písmen a diakritiku).
- Nový DB záznam sám o sobě ještě nerozšíří statický seznam druhů v `lib/product-types.ts`; dynamické načítání nových typů do UI, pravidel klasifikace a plánovače zůstává navazující implementační krok. Tím se zabrání tomu, aby se nový druh tvářil jako plně podporovaný, dokud aplikace neumí bezpečně využívat jeho definici.

Tato fáze záměrně neprovádí automatické mapování na existující druhy. To je samostatný krok `Mapping engine`.

### 7.13 Zdrojové reference

- GS1 GPC: aktuální standard a archiv verzí — https://ref.gs1.org/standards/gpc/
- GS1 GPC schema/principles — https://support.gs1.org/support/solutions/articles/43000734164-what-is-the-gpc-schema-
- Open Food Facts — https://world.openfoodfacts.org/
- Open Food Facts API / data — https://world.openfoodfacts.org/data
- CZ-CPA 2025 / CPA Ver. 2.2 — https://csu.gov.cz/klasifikace-produkce-cz-cpa-platna-od-1-1-2025

## 8. Aktuální hlavní koncept

Od **2026-10-08** je tento dokument autoritativním konceptem pro produktové druhy a jejich klasifikaci v Shopping_Buddy.

Ruční seznam v `lib/product-types.ts` je považován za aktuální aplikační vrstvu, nikoli za konečný zdroj pravdy o všech druzích zboží.

Budoucí rozšíření musí zachovat:

- stabilní interní Product Type identity,
- oddělení druhu, varianty, formy a balení,
- univerzální model množství pro všechny druhy zboží,
- bezpečné a vysvětlitelné převody jednotek a balení,
- kombinaci GS1 GPC + Open Food Facts + CZ-CPA + vlastních katalogových dat,
- kandidátní vrstvu pro dosud nepokryté druhy,
- pravidlo `unknown` místo hádání,
- ochranu ručních korekcí,
- verzování zdrojů, pravidel a mapování,
- regresní testování proti reálnému katalogu.

Tento dokument musí být aktualizován současně s každou změnou datového modelu nebo klasifikační logiky, která mění význam Product Type, balení nebo převodů množství.

### 7.12g Stav PKD normalizace a deduplikace — 2026-10-08

Fáze normalizace a deduplikace je implementována jako nedestruktivní vrstva nad importovanými PKD záznamy.

- Normalizace je verzovaná (2026-10-v1).
- Kanonické názvy se normalizují přes existující bezpečnou textovou normalizaci: Unicode/diakritika, velikost písmen, interpunkce a whitespace; číslice se nemění ani se neodhadují.
- Každý PKD entry může mít normalizační záznam v pkd_entry_normalizations s normalizedName, identityKey, verzí a použitými metodami.
- Stejný normalizovaný název ve stejném jazyce vytváří kandidáta na deduplikaci, nikoli automatické sloučení.
- Konfliktní explicitní atributy (category, subcategory, physicalForm, processingState) kandidáta zablokují.
- Chybějící atribut není považován za konflikt a nevymýšlí se jeho hodnota.
- Kandidáti jsou uloženi v pkd_dedup_candidates s důvodem, confidence a evidence; stav je candidate a vyžaduje další rozhodnutí.
- Normalizace nesmí sloučit Product Type s variantou, formou, balením ani retailer SKU.
- Runner: pnpm db:normalize-pkd (dry-run), pnpm db:normalize-pkd -- --apply (zápis).

### 7.12j Stav PKD mapping acceptance workflow — 2026-10-08

- **Přidáno:** auditovaná acceptance vrstva pro kandidátní vazby v `pkd_product_type_mappings`.
- **Schválení:** pouze kandidát ve stavu `candidate` může být přijat; současně se v jedné databázové operaci zapíše `pkd_entries.product_type_id` a auditní záznam do `pkd_product_type_mapping_reviews`.
- **Ochrana proti přepsání:** schválení selže, pokud už má PKD záznam přiřazený jiný Product Type. Ruční oprava provedená mezitím tedy nemůže být přepsána starším kandidátem.
- **Zamítnutí:** mění pouze stav kandidáta na `rejected` a vyžaduje poznámku s důvodem.
- **Audit:** ukládá rozhodnutí, reviewer UUID, poznámku a čas; původní evidence kandidáta zůstává zachována v mapping řádku.
- **Idempotence:** již schválené nebo zamítnuté kandidáty nelze znovu rozhodnout.
- **CLI:** `pnpm db:review-pkd-mapping -- --list` zobrazí čekající kandidáty; rozhodnutí používá `--id=<UUID> --accept|--reject --reviewer=<UUID> [--note=<text>]`.
- **Bezpečnost:** workflow samo o sobě není automatické AI schvalování; explicitní lidské rozhodnutí je oddělené od generování kandidátů.
- **Migration:** `0083_pkd_mapping_acceptance.sql`.

### 7.12i Stav PKD mapping engine — 2026-10-08

- **Přidáno:** návrhová vrstva pro mapování PKD záznamů na již existující interní Product Types.
- **Princip:** engine nemění product_types ani automaticky nezapisuje pkd_entries.product_type_id; vytváří pouze kandidátní vazbu v pkd_product_type_mappings se stavem candidate.
- **Přesná shoda:** pouze přesný normalizovaný název Product Type nebo jeho evidované synonymum vytváří kandidáta s důvěrou 0.99.
- **Zakázaná heuristika:** obecný klasifikátor účtenkových položek se pro formální názvy externích taxonomií nepoužívá. Může chybně přiřadit např. „PIVOTAL RAZOR HEAD“ k typu „Pivo“ nebo služby k typu zboží.
- **Bezpečnost:** neexistující přesná shoda, nejednoznačný název, zamítnutý/neaktivní záznam nebo již namapovaný záznam znamená žádnou novou vazbu. Engine nikdy nehádá podle částečné shody.
- **Provenience:** každá kandidátní vazba obsahuje metodu, důvěru, vstupní název, normalizovaný název, kategorii a důvod rozhodnutí; bezpečná verze engine je 2026-10-v2.
- **Údržba kandidátů:** při `--apply` se nejprve odstraní pouze dosud neschválené návrhy (`status=candidate`) a následně se vytvoří aktuální kandidáti. Schválené a zamítnuté záznamy zůstávají zachované.
- **Runner:** pnpm db:generate-pkd-mappings (dry-run), pnpm db:generate-pkd-mappings -- --apply (uloží pouze kandidátní mapování).
- **Další krok:** samostatné schvalovací/acceptance workflow, které teprve po lidském potvrzení může propsat schválené mapování do pkd_entries.product_type_id.
- GitHub Actions: workflow `PKD Product Type mapping generation` je manuální přes `workflow_dispatch` a zapisuje pouze kandidátní vazby.

### 7.12k Stav PKD approved mapping backfill — 2026-10-08

- **Účel:** promítnout pouze již schválené PKD → Product Type mappingy do PKD záznamů, které ještě nemají Product Type.
- **Runner:** `pnpm db:backfill-pkd-mappings` je dry-run; zápis vyžaduje `--apply`.
- **GitHub Actions:** workflow `PKD approved mapping backfill` je pouze manuální přes `workflow_dispatch` a obsahuje explicitní boolean `apply`.

### 7.12l Stav PKD mapping review workflow — 2026-10-08

- Workflow `PKD Product Type mapping review` umožňuje nejprve vypsat kandidátní mapování a následně jednotlivý kandidát přijmout nebo zamítnout.
- Přijetí vyžaduje `mapping_id` a `reviewer_id`; zamítnutí navíc vyžaduje poznámku.
- Workflow pouze volá existující auditovanou acceptance vrstvu; samo neobchází bezpečnostní kontrolu ani nezapisuje `product_type_id` mimo `acceptPkdProductTypeMapping`.
- **Bezpečnost:** workflow nikdy nepoužívá kandidátní ani zamítnuté mappingy a při zápisu znovu kontroluje, že `product_type_id IS NULL`.
