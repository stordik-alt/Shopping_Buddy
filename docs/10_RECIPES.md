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

Karta výsledku:
- název
- zdroj
- obrázek, pokud je bezpečně dostupný
- počet porcí
- čas přípravy
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
- oblíbené recepty
- historie
- filtry podle domácnosti
- „Co uvařit z toho, co mám doma“
- napojení receptů na akce a ceny
- odhad ceny receptu podle aktuálních cen
- doporučení receptů podle zásob

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
