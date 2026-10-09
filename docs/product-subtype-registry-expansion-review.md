# Návrhy rozšíření registru Product Subtype — 2026-10-09

**Stav: návrhy k revizi, neschváleno.** Podklady pocházejí z read-only běhu GitHub Actions [37910630603](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37910630603). Inventář našel 88 Product Types pokrývajících 6 292 produktů bez mapy do startovacího registru.

## Bezpečnost a použití

- Soubor `docs/examples/product-subtype-registry-expansion-candidates.json` obsahuje návrhy ve formátu podporovaném `pnpm db:product-subtype-candidates`.
- Soubor **nebyl importován do databáze**. Nejprve jej zkontrolovat a spustit pouze DRY RUN.
- Návrhy nejsou schválením taxonomie. Nesmí se podle nich automaticky přiřazovat existující produkty.
- Ukázkové produkty a počty jsou kontext inventáře, nikoli důkaz, že každý produkt daného typu patří do navrženého poddruhu.
- V jedné hierarchii musí být jasné, zda jsou poddruhy vzájemně výlučné. Křížové vlastnosti, například bezlepkovost, velikost plen, značka, balení, EAN a SKU, mají být atributy, nikoli samostatné poddruhy.
- Rýže vyžaduje zvláštní rozhodnutí o prioritě odrůdy a úpravy (např. basmati vs. parboiled), aby jeden produkt nedostal více konkurenčních poddruhů.

## 1. Přehled největších nemapovaných Product Types

| Product Type | Produktů | Návrh dalšího kroku |
|---|---:|---|
| Pivo | 609 | Prověřit osu poddruhů podle barvy; nealkoholické/ochucené pivo je spíše další vlastnost a může se překrývat. |
| Těstoviny | 419 | Priorita A: tvar/formát nabízí srozumitelné hranice; odlišit polévkové, dlouhé, krátké, plněné a lasagne pláty. |
| Šampon | 353 | Nezakládat hned: účel, typ vlasů, lupy a barvené vlasy se překrývají. Nejprve vybrat jednu klasifikační osu nebo používat atributy. |
| Chléb | 345 | Nezakládat hned: žitný, celozrnný a kváskový mohou být současně pravdivé; nejprve zvolit osu. Zohlednit samostatný Product Type „Toustový chléb“. |
| Šunka | 322 | Nezakládat hned: druh masa a způsob zpracování jsou dvě různé osy a mohou se překrývat. |
| Sprchový gel | 287 | Nezakládat hned: vůně, účel, typ pokožky a dětské použití jsou křížové atributy. |
| Rýže | 246 | Priorita A, ale vyžaduje schválení pravidla priority odrůda → úprava → tvar zrna. Návrhy jsou v JSON. |
| Zubní pasta | 211 | Nezakládat hned: bělení, citlivé zuby, ochrana proti kazu a dětské použití se mohou překrývat. |
| Párky | 210 | Nezakládat hned: druh masa, receptura a styl výrobku se překrývají; nejprve definovat jednu osu. |
| Bílý jogurt | 189 | Prověřit rozdíl mezi bílým jogurtem, řeckým stylem a vysokým obsahem bílkovin; bezlaktózovost má být atribut. |
| Pleny | 130 | Velikost, hmotnostní rozsah a počet kusů jsou atributy/balení, nikoli poddruhy. Zatím nepřidávat subtype. |
| Tvaroh | 114 | Priorita A: tučný/polotučný/odtučněný podle výslovného označení výrobce; nesmí se domýšlet z názvu. Návrhy jsou v JSON. |
| Hermelín a camembert | 112 | Pozastavit: auditní vzorek zahrnoval i Brie. Nejprve prověřit kvalitu a hranice současného Product Type. |
| Slanina | 105 | Nezakládat hned: plátkování a uzení jsou různé osy. |
| Prací gel | 104 | Nezakládat hned: barva prádla, koncentrace a počet pracích dávek jsou různé vlastnosti; počet dávek/balení není subtype. |
| Tavený sýr | 102 | Priorita B: plátkový, roztíratelný a porcovaný podle formy produktu. Návrhy jsou v JSON. |
| Kuřecí stehna a čtvrtky | 94 | Nejdřív ověřit, zda jde o jeden Product Type a zda řízek/stehno/čtvrtka nejsou smíšené formy. |
| Máslo | 91 | Zkontrolovat, zda má Product Type samostatnou mapu; nepatří do aktuálních 15 největších mimo registr. |
| Sůl | 90 | Možná osa podle úpravy/zrnitosti, ale nejprve oddělit kuchyňskou sůl od speciálních solí bez překryvu. |
| Hovězí zadní | 85 | Prověřit anatomické řezy a soulad Product Type; nevytvářet poddruhy z nekonzistentních názvů. |
| Rajčata | 84 | Osa odrůdy (cherry, koktejlová apod.) je možná; ověřit hranice proti rajčatům zpracovaným/konzervovaným. |
| Tuňák v konzervě | 82 | Priorita B: rozlišit konzervační nálev, pokud je jednoznačně uveden. Návrhy jsou v JSON. |
| Toustový chléb | 76 | Samostatný Product Type už je konkrétnější než „Chléb“; nejdřív zkontrolovat, zda další subtype skutečně přidá hodnotu. |
| Houska a kaiserka | 74 | Prověřit, zda Product Type nespojuje dva samostatné typy pečiva. |
| Vejce | 67 | Velikost, původ chovu a počet kusů mají být atributy/balení, pokud není schválen jiný jasný klasifikační důvod. |

## 2. Kandidáti připravení k prvnímu kolu revize

JSON obsahuje 22 návrhů pro šest rodičovských typů:

- **Pivo:** světlé, polotmavé, tmavé pivo. Barva musí být výslovně doložena; nealkoholické pivo není v této ose subtype.
- **Těstoviny:** dlouhé, krátké tvarované, polévkové, plněné, pláty na lasagne.
- **Rýže:** basmati, jasmínová, arborio/rýže na rizoto, parboiled, natural/celozrnná, ostatní dlouhozrnná, ostatní kulatozrnná. Nutno schválit prioritu při překryvu odrůdy a úpravy.
- **Tvaroh:** tučný, polotučný, odtučněný; klasifikovat jen z výslovného údaje/ověřené specifikace.
- **Tavený sýr:** plátkový, roztíratelný, porcovaný.
- **Tuňák v konzervě:** ve vlastní šťávě, v oleji, ve vodním nálevu.

Každý návrh v JSON má definici, příklad zahrnutí/vyloučení a odkaz na běh inventáře. Neobsahuje konkrétní přiřazení produktů ani skutečná SKU/EAN.

## 3. Další kontrolní kroky

1. Zkontrolovat rodičovské Product Types a případné duplicitní/nesourodé skupiny.
2. Schválit nebo upravit klasifikační osu a pravidla precedence pro každou rodinu.
3. Spustit DRY RUN kandidátního importu a ověřit stabilní klíče a deduplikaci.
4. Teprve po kontrole výstupu výslovně rozhodnout, zda vložit návrhy do databázové fronty. Schválení kandidátů zůstává samostatný krok.
5. Při pozdějším schválení poddruhu stále samostatně připravit mapování produktů; vytvoření poddruhu produkty nepřiřazuje.

