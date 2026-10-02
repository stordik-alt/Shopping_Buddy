# Recepty z internetových portálů

## Cíl
Přidat do ANITKY samostatnou sekci **Recepty**, na mobilu dostupnou přes **Více**.

Uživatel může:
1. vyhledat recept podle názvu, suroviny nebo fráze,
2. otevřít detail receptu,
3. nastavit požadovaný počet porcí,
4. zobrazit přepočtené množství surovin,
5. přidat vybrané suroviny do nákupního seznamu,
6. otevřít původní recept na zdrojovém webu.

ANITKA nemá nahrazovat zdrojový web. Postup přípravy se v první verzi nekopíruje; uživatel pokračuje na originální stránku.

## Mobilní navigace
Současná mobilní navigace má pět slotů: Domů, Nákup, Zásoby, Rozpočet, Více.

Recepty přidat do MORE_TABS.

Navržená ikona: CookingPot z Lucide.
Label: **Recepty**.

Nabídka Více:
- Akce
- Obchody
- Recepty
- Profil
- AI (pokud je aktivní)

## UX

### Přehled
Horní část:
- nadpis **Recepty**
- vyhledávací pole
- volitelný filtr zdroje
- rychlé filtry: Rychlé, Večeře, Oběd, Polévky, Maso, Těstoviny, Dezerty, Bezmasé

### Řazení výsledků

U výsledků přidat možnost řazení:
- Relevance
- Hodnocení
- Doba přípravy
- Nejnovější, pokud zdroj poskytuje datum

Řazení podle **Hodnocení** používá uživatelské hodnocení převzaté ze zdrojového portálu. Pokud zdroj poskytuje i počet hodnocení, zobrazit jej společně s hodnocením a použít jej jako sekundární údaj pro transparentnost výsledku.

Pokud různé zdroje používají odlišnou stupnici hodnocení, interně ji normalizovat na společnou stupnici 0–5, ale zároveň zachovat původní hodnotu a původní stupnici pro zobrazení, pokud je dostupná.

Pokud hodnocení nebo počet hodnocení není dostupný, pole zůstane prázdné. Recept bez hodnocení nesmí být chybně považován za recept s nulovým hodnocením.

Karta výsledku:
- název
- zdroj
- obrázek, pokud je bezpečně dostupný
- počet porcí
- čas přípravy
- uživatelské hodnocení ze zdrojového webu, pokud je dostupné
- počet hodnocení, pokud je dostupný
- krátký popis

### Detail
Zobrazit:
- název
- zdrojový portál
- obrázek
- původní počet porcí
- ovladač **Počet porcí**
- seznam surovin s přepočtem
- **Přidat suroviny do nákupu**
- **Zobrazit celý recept**

Příklad:

**Kuřecí rizoto**

Původně: 4 porce

− 6 porcí +

- 750 g kuřecího masa
- 450 g rýže
- 2 ks cibule
- 1,5 l vývaru

### Přepočet
Pokud zdroj uvádí 4 porce a uživatel zvolí 6:

nové množství = původní množství × (6 / 4)

Pracovat s desetinnými hodnotami a zobrazovat je přirozeně: 0,5 kg, 750 g, 1,5 l, 2 ks.

Pokud počet porcí nelze spolehlivě určit, přepočet vypnout a zobrazit původní množství.

## Zdroje
První verze musí být připravena pro více zdrojů, nikoliv pro jeden pevně zabudovaný web.

Preferované české zdroje:
- Recepty.cz — https://www.recepty.cz/
- Apetit Online — https://www.apetitonline.cz/recepty
- Toprecepty — https://www.toprecepty.cz/
- Vaření.cz — https://www.vareni.cz/

Každý zdroj má vlastní adapter:
- lib/recipes/sources/recepty-cz.ts
- lib/recipes/sources/apetit.ts
- lib/recipes/sources/toprecepty.ts
- lib/recipes/sources/vareni.ts

Společné rozhraní:

~~~ts
type RecipeSourceAdapter = {
  id: string
  name: string
  domains: string[]
  search(query: string): Promise<RecipeSearchResult[]>
  getRecipe(url: string): Promise<Recipe>
}
~~~

Pokud zdroj používá schema.org/Recipe v JSON-LD, parser má přednostně použít tato strukturovaná data.

Relevantní pole:
- name
- image
- description
- recipeYield
- recipeIngredient
- recipeInstructions
- prepTime
- cookTime
- totalTime
- recipeCategory
- recipeCuisine
- aggregateRating.ratingValue
- aggregateRating.bestRating
- aggregateRating.ratingCount

## Vyhledávání
Klient nesmí přímo stahovat libovolné webové stránky.

Tok:

UI → server action/API → recipe search service → zdroj / vyhledávací index → normalizace → UI

Server:
- validuje dotaz,
- používá pouze povolené zdroje,
- řeší timeout,
- cachuje,
- deduplikuje podle canonical URL,
- vrací jednotný datový model.

Vyhledávání podle surovin je důležité. Dotaz „kuřecí maso rýže“ může najít recepty, jejichž název neobsahuje všechny výrazy.

## Datový model

~~~ts
type Recipe = {
  id: string
  sourceId: string
  sourceName: string
  sourceUrl: string
  canonicalUrl: string
  title: string
  description?: string
  imageUrl?: string
  servings?: number
  servingsText?: string
  prepTimeMinutes?: number
  cookTimeMinutes?: number
  totalTimeMinutes?: number
  category?: string
  cuisine?: string
  ratingValue?: number
  ratingScale?: number
  ratingCount?: number
  ratingSource?: string
  ingredients: RecipeIngredient[]
  fetchedAt: string
  parserVersion: number
}

type RecipeIngredient = {
  id: string
  originalText: string
  quantity?: number
  unit?: string
  name: string
  scalable: boolean
}
~~~

originalText je důležitý fallback. Pokud parser neumí bezpečně rozdělit ingredienci na množství/jednotku/název, zachová se celý řádek a scalable bude false.

## Přidání surovin do nákupního seznamu
Po kliknutí na **Přidat suroviny do nákupu**:
- použít aktuálně nastavený počet porcí,
- zachovat množství a jednotku,
- automaticky kategorizovat stejně jako ostatní nákupní položky,
- respektovat existující zásoby, pokud to současná nákupní logika podporuje.

U ingrediencí typu „špetka soli“ nevytvářet automaticky položku s množstvím 1. Označit ji jako nekvantifikovatelnou a nechat rozhodnutí na uživateli.

## Zdroj a autorská práva
ANITKA má zobrazovat pouze data potřebná pro výběr receptu a práci se surovinami.

Postup přípravy v první verzi nekopírovat jako vlastní obsah.

Detail musí vždy obsahovat:
**Zdroj: Název portálu**

a tlačítko:
**Zobrazit celý recept ↗**

které otevře sourceUrl.

Implementace musí respektovat podmínky jednotlivých zdrojů, robots.txt, API/licenční omezení a pravidla automatizovaného přístupu. Pokud konkrétní zdroj automatické načítání nepovoluje nebo neposkytuje vhodná data, adapter jej nesmí obcházet.

## Cache
- výsledky vyhledávání: krátká cache
- detail receptu: delší cache
- canonical URL jako primární klíč
- parserVersion pro invalidaci starších výsledků

Do DB neukládat celý HTML dokument zdrojového webu; ukládat pouze normalizovaný výsledek a nezbytná metadata.

## Bezpečnost
- nepřijímat libovolný URL fetch z klienta,
- povolit pouze známé domény,
- blokovat localhost/private IP/metadata endpoints,
- timeout a maximální velikost odpovědi,
- kontrolovat content type,
- nepřenášet cookies uživatele na zdrojový web,
- obrázky načítat bezpečně přes proxy/cache nebo důvěryhodné hostitele.

## Chyby
Pokud se recept nepodaří kompletně parsovat:
- nezobrazovat jej jako bezchybný,
- zobrazit pouze spolehlivě získaná data,
- označit problém,
- nabídnout **Zobrazit původní recept**.

Pokud není možné bezpečně určit počet porcí, zobrazit:
„Počet porcí není u tohoto receptu dostupný“
a deaktivovat přepočet.

## Testy

### Parser
- Recipe JSON-LD
- více JSON-LD bloků
- @graph
- chybějící pole
- textový recipeYield
- číselný recipeYield
- aggregateRating
- ratingCount
- odlišná stupnice hodnocení
- více jednotek
- desetinná množství
- neškálovatelné ingredience

### Přepočet
- 4 → 4
- 4 → 2
- 4 → 6
- 2 → 10
- desetinná množství
- recept bez známého počtu porcí

### Zdroje
Každý adapter má fixture test s reprezentativní strukturou zdroje.

### Bezpečnost
- nepovolená doména
- localhost/private IP
- timeout
- příliš velká odpověď
- nepodporovaný content type

### UI
- Recepty přes Více
- vyhledávání
- řazení podle relevance, hodnocení a doby přípravy
- zobrazení hodnocení a počtu hodnocení
- detail
- změna porcí
- přepočet
- odkaz na originál
- chybový stav

## Fáze implementace

### Fáze 1 — základ
- datový model
- parser Schema.org Recipe
- normalizace ingrediencí
- přepočet porcí
- bezpečný fetch
- cache
- testy

### Fáze 2 — zdroje
- Recepty.cz
- Apetit Online
- Toprecepty
- Vaření.cz
- deduplikace

### Fáze 3 — UI
- Recepty v Více
- vyhledávání
- výsledky
- detail
- počet porcí
- suroviny
- odkaz na originál

### Fáze 4 — propojení s nákupem
- Přidat suroviny do nákupu
- mapování jednotek
- využití zásob
- označení problematických ingrediencí

### Fáze 5 — pozdější rozšíření

#### Fáze 5A — oblíbené a historie
- ukládání oblíbených receptů pro domácnost
- historie naposledy otevřených receptů
- opětovné otevření detailu z obou seznamů
- ukládat pouze normalizovaná metadata receptu, nikoliv postup přípravy
- oblíbené i historie musí být per-household a serverově autorizované

#### Fáze 5B — doporučení a rozšířené filtry
- volitelný filtr „Podle domácnosti“ pro běžné vyhledávání
- automaticky vyřadit recepty obsahující ingredienci, jejíž normalizovaný název odpovídá alergenu uloženému u člena domácnosti
- automaticky vyřadit recepty obsahující ingredienci, kterou má některý člen v poli „Nechce“, pomocí deterministického normalizovaného porovnání názvu ingredience
- pokud portál nebo parser alergii z ingredience spolehlivě neodvodí (např. mléko vs. laktóza), ANITKA nesmí vztah vytvořit odhadem; takový recept může filtrem projít
- oblíbené potraviny členů domácnosti použít pouze jako měkký signál pro řazení, nikdy jako podmínku
- profily dětí a volný text „specifické potřeby“ v této fázi nepřevádět na automatické dietní závěry
- nabídnout samostatný režim **„Co uvařit z toho, co mám doma“**
- návrhy mají vznikat z aktuálně evidovaných zásob domácnosti, bez AI odhadů a bez automatického převodu neporovnatelných jednotek
- pro každý návrh zobrazit pokrytí surovin ze zásob (např. „Máte doma 4 z 5 surovin“) a chybějící množství; detail používá stejnou analýzu zásob jako fáze 4
- recept musí mít alespoň jednu spolehlivě spárovanou surovinu se zásobou, aby se dostal do tohoto režimu
- doporučení nesmí obcházet ochranu zdrojů, allowlist ani cache zavedené ve fázích 1–2
- žádná nová per-user/per-household databázová tabulka není pro 5B potřeba; používají se existující profily, preference a zásoby

#### Fáze 5C — ceny a akce
- napojit recepty na existující aktuální cenová a akční data ANITKY; nevytvářet novou paralelní cenovou databázi
- pro ingredienci použít pouze spolehlivě nalezený katalogový produkt; název receptové ingredience sám o sobě nesmí vytvořit falešnou shodu s jiným produktem
- respektovat stejné převody porovnatelných jednotek jako ve fázi 4: kg↔g a l↔ml; neporovnávat ks s hmotností/objemem bez skutečně uložené produktové jednotky
- zobrazit u receptu odhad ceny jen z aktuálně evidovaných cen; chybějící nebo neporovnatelnou ingredienci nepřepočítávat odhadem
- uvést, kolik ingrediencí vstoupilo do odhadu a kolik jich nelze z aktuálních dat bezpečně ocenit
- pro každou ocenitelnou ingredienci použít aktuálně platnou cenu; aktivní akce má přednost před běžnou cenou, stejně jako v existující cenové logice
- umožnit zobrazit nejlevnější známou variantu mezi řetězci a samostatně informaci o aktuální akci, pokud existuje
- při výpočtu celkové ceny receptu sčítat cenu potřebného množství, nikoliv cenu celé balíčkové jednotky; pro kg/l využít uloženou jednotkovou cenu, pro ks pouze skutečně srovnatelnou cenu za kus
- zachovat původní datový zdroj, platnost akce a transparentnost ceny; nezobrazovat cenu jako jistou, pokud jde pouze o odhad z neúplných dat
- žádná nová per-user/per-household cenová tabulka není pro 5C potřeba; používají se existující ceny, akce, produktový katalog a stávající cenové služby
- Phase 5C nesmí obcházet allowlist, cache ani ochranu zdrojů zavedenou ve fázích 1–2

## Akce + recepty
Budoucí rozšíření může využít existující cenová data ANITKY.

Například u receptu na kuřecí rizoto:
- kuřecí maso
- rýže
- cibule
- paprika

později zobrazit:
„Odhad ceny podle aktuálních cen: 186 Kč“
nebo:
„Paprika je tento týden v akci v Albertu“

Toto není součást první verze.

## Produktové pravidlo
Receptová sekce má být především **pomůcka pro výběr jídla a vytvoření nákupního seznamu**, nikoliv kopie receptových portálů.

Hlavní cesta:

**Vyhledat → vybrat → nastavit porce → zkontrolovat suroviny → přidat do nákupu → otevřít originál pro postup.**

## Recipe pricing — culinary measures and package sizes (2026-10-01)

Recipe pricing uses the actual consumed amount multiplied by the product's comparable unit price.

Culinary measures are resolved before pricing:
- `lžička` / `lžíce`: ingredient-specific mass takes precedence when available; otherwise the standard volume is used (`5 ml` / `15 ml`).
- `špetka`: ingredient-specific mass is preferred; otherwise a small generic estimate is used and marked as estimated.
- `hrnek` / `šálek`: standard volume estimate.
- `stroužek`: ingredient-specific mass is currently supported for garlic.
- unsupported or genuinely unquantifiable expressions such as `podle chuti` remain unpriced.

Retail package size is standardized independently from recipe consumption. The persistent `product_packages` catalog is now read by price queries when the current package price/unit-price ratio matches a known canonical size; otherwise the domain layer safely falls back to deriving the size from package price divided by comparable unit price. The resolved value is canonicalized to `kg`, `l` or `ks` for display/comparison.

The UI marks recipe costs that depend on an estimated culinary measure and can show the resolved retail package size. Recipe cost itself still uses the amount actually consumed and must not be replaced by the whole package price.