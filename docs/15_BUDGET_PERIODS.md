# 15 — Rozpočet: kompletní koncept

**Status:** koncept / zdroj pravdy pro plánovanou rozšířenou logiku Rozpočtu  
**Scope:** plánování rozpočtu, příjmy, výdaje, pravidelné platby, úspory, Kapsy, zůstatky, rozpočtová období a převody mezi obdobími.

## Stav implementace (2026-10-10)

Hotovo: rozpočtové období jako konfigurace (kalendářní / podle výplaty / vlastní, `lib/budget-period.ts`, serverové načtení v `lib/db/period-config.ts`), příjmy plánované a skutečné (tabulka `incomes`, přechod plánováno → přijato na stejném záznamu), čisté funkce zůstatků podle kap. 9 (`lib/budget-balances.ts`), záložka Přehled / Výdaje / Plánování s příjmy aktuálního období.

Vlastní období je hotové i v klientovi (2026-10-10): všechna budgetová matematika (`lib/budget.ts`) i komponenty berou `PeriodConfig` (`household.budgetPeriod`), server ho posílá z `lib/db/queries.ts`. Období se nastavuje v Rozpočet → Plánování (kalendářní měsíc / od výplaty / vlastní = první den + délka ve dnech); z Profilu byl výběr dne začátku odstraněn, jak požaduje kap. 2. Po změně se dotáhnou výdaje nového aktuálního období. Starší funkce přijímají i holé číslo jako zkratku pro „od výplaty, den N“.

Kapsy, uzavření období a převody jsou hotové (2026-10-10; čistá logika `lib/budget-closing.ts`, data `lib/db/period-ledger.ts`, akce `app/actions/pockets.ts` a `period-closing.ts`, migrace `0087`):
- **Kapsa** (`pockets`): název, ikona z pevné sady, cílová částka + termín (jen společně), počáteční částka, plánovaný příspěvek, odložení (`archived_at`, jen prázdné Kapsy). Zůstatek se neukládá: je to počáteční částka + součet převodů (`pocket_transfers`), takže plánovaný příspěvek zůstatek nemění (§11.1). Doporučený příspěvek = chybějící částka rovnoměrně na zbývající období do termínu (včetně aktuálního), zaokrouhleno nahoru na celé Kč.
- **Převod Rozpočet ↔ Kapsa** je skutečná operace: do Kapsy nejvýše skutečný zůstatek období (převod nevytváří peníze, schodek se nespoří), z Kapsy nejvýše její zůstatek. Nic se nepřesouvá bez potvrzení uživatele.
- **Uzavření** (`period_closings`) nabízí poslední skončené období, ve kterém se něco dělo. Výsledek = přijaté příjmy + převod z předchozího období − výdaje − běžné převody do Kapes. Přebytek lze rozdělit do Kapes a do dalšího období (nepřiřazený zbytek zůstane mimo plán, `kept_amount`); schodek nelze ukládat, kryje se z Kapes a nepokrytá část přejde jako záporný převod. Server výsledek počítá sám a rozdělení ověřuje stejnými pravidly (`planClosing`).
- **Převod do dalšího období** se neukládá, ale počítá: `převod = výsledek − pohyby Kapes při uzavření − nepřiřazeno`. Proto se při změně uzavřeného období (nový výdaj, příjem) převod i navazující období přepočtou samy (§14: +1 800 a výdaj 500 → +1 300). Uzavřené období se dá znovu otevřít, pokud není uzavřené následující a peníze uložené při uzavření nebyly mezitím použity.
- Uzavření odkazuje na konec období (`period_end`), ne na nastavení domácnosti, takže pozdější změna typu období převod neodpojí.

Predikce schodku a doporučení (kap. 16–17) jsou hotové (2026-10-10, `lib/budget-forecast.ts`): sekce Predikce v Plánování ukazuje dostupný zůstatek (skutečný − nezaplacené pravidelné platby období) a predikovaný zůstatek (skutečný + plánované příjmy − nezaplacené pravidelné platby − zbývající plánované příspěvky do Kapes). Běžné nákupy se neodhadují. Při záporné predikci ANITKA řekne, kolik přibližně bude chybět, a navrhne odložit plánované úspory, využít Kapsy a nepokrytý zbytek převést jako záporný převod; jsou to jen návrhy bez pohybu peněz. Dále hotovo (2026-10-10, migrace `0088`):
- **Plánované výdaje** (`planned_expenses`, kap. 7–8): očekávaný výdaj s datem (i v budoucnosti); „Zaplaceno“ z něj vytvoří skutečný výdaj a plán označí jako zaplacený. Do predikce se počítá, do skutečného zůstatku ne; při schodku se navrhuje i ubrat z nich.
- **Finanční rezerva** (`pockets.is_reserve`, kap. 11): jedna Kapsa domácnosti může být rezerva; návrhy při schodku sahají nejdřív do ní.
- **Doporučení při uzavření období** (kap. 12, 17, `lib/budget-recommendation.ts`): přebytek se navrhne rozdělit na „ponechat na další období, co nepokryje jeho příjem“ (pravidelné platby + plánované výdaje − plánované příjmy) → doplnění rezervy k jejímu cíli (bez cíle k jednomu období výdajů) → plánované / doporučené příspěvky ostatních Kapes od nejbližšího termínu → zbytek do dalšího období. Schodek se navrhne krýt z rezervy, pak z největší Kapsy. Návrh jen předvyplní formulář uzavření; uživatel ho mění a server ho ověří stejnými pravidly jako každé rozdělení.
- **Historie období** (kap. 18, `lib/budget-history.ts`): minulá období podle nastavení domácnosti (nejvýše 24 zpět; prázdná se vynechají) s rozpočtem, příjmy, výdaji, uloženým, převody, výsledkem / schodkem a stavem uzavření.

Plánování dopředu, plánovaný převod a vyhrazení na závazky jsou hotové (2026-10-10, migrace `0089`, `lib/budget-outlook.ts`):
- **Výhled a plán budoucích období (kap. 14, 16):** Plánování má šipky mezi obdobími (běžné + 12 dalších) a kartu Výhled dalších období. Do budoucího období lze zapsat plánované příjmy a plánované výdaje (nové záznamy začínají prvním dnem období); nelze je tam označit jako přijaté / zaplacené a nezobrazuje se skutečný zůstatek, Kapsy, uzavření ani historie, protože období ještě nezačalo. Očekávaný zůstatek období = začátek (skutečný zůstatek teď, u dalších očekávaný převod předchozího) + plánované a už přijaté příjmy − očekávané výdaje − plánované úspory. Běžné nákupy budoucího období nejsou známé, proto za ně stojí **rozpočet období**; pravidelné platby a plánované výdaje, které rozpočet přesahují, ho navýší. U běžného období zůstává tolik rozpočtu, kolik se ještě nevyčerpalo. Predikce běžného období (kap. 16) zůstává jen ze známých peněz.
- **Plánovaný převod (kap. 14):** tabulka `planned_carries` drží, kolik chce domácnost nechat na další období (jedno číslo na období, jen běžné a budoucí). Je to jen plán: do výhledu se přenese nejvýš tolik, kolik období podle výhledu skončí (přebytek, který nikdo nepřiřadil, se nepřenáší; schodek se přenáší celý jako záporný). Při uzavření plán předvyplní „do dalšího období“ (nejvýš skutečný přebytek, příklad z konceptu: plán +2 000, skutečný přebytek +1 500 → +1 500) a uzavření ho ve stejné dávce smaže, protože ho nahradil skutečný převod.
- **Vyhrazení na závazky při uzavření (kap. 12, 14):** list Uzavření období ukazuje „Vyhrazeno na závazky“ = co další období potřebuje na pravidelné platby a plánované výdaje nad své příjmy a nad peníze, které už má (`nextPeriodNeed` s `onHand`), a upozorní, když rozdělení do dalšího období převádí méně. Je to upozornění, ne zámek: peníze se přesouvají jen po potvrzení uživatele a server rozdělení ověřuje stejnými pravidly jako dřív.
- **Historie → výdaje (kap. 18):** řádek historie má „Zobrazit výdaje“, které otevře Výdaje na daném období.

- **Mobilní zobrazení (kap. 21):** Plánování i Přehled jsou zkrácené na jednu obrazovku telefonu. Nahoře zůstává to, co je akční nebo klíčové (výzva k uzavření, Skutečně, Odhad konce období – dřívější karty Plánováno a Predikce jsou sloučené do jedné). Vše ostatní (Příjmy, Plánované výdaje, Kapsy, Převod do dalšího období, Výhled, Historie, Nastavení období; na Přehledu Plán a úspory, Podle kategorií, Pravidelné platby) je sbalitelný blok `Panel` s jedním řádkem shrnutí; otevřou se samy jen tam, kde něco čeká (platby k potvrzení, kategorie nad limitem) nebo při plánování budoucího období. Obsah zůstává připojený, takže rozepsané formuláře zavřením nezmizí.
- **Kapsy (kap. 11):** název je volný text (až 60 znaků, lze kdykoli změnit, i s emoji; dvě Kapsy smějí mít stejný název), přejmenování ani plán, výhled či zobrazení nikdy nevytvoří převod. Peníze se do Kapsy přiřazují a z ní odebírají jen akcí uživatele (Uložit / Vzít) nebo potvrzeným uzavřením období; úprava počáteční částky Kapsy je jediná další ruční cesta a mění jen to, kolik v ní uživatel už měl.

Zatím ne: skutečné rezervování peněz (zámek) na závazky, plánované převody do Kapes po obdobích (plán Kapsy je stále jeden příspěvek na období) a opakování plánovaných příjmů / výdajů. Stav Kapes se v UI načítá při otevření Plánování a po každé změně; dva členové domácnosti, kteří ve stejném okamžiku uloží do téže Kapsy, mohou oba projít kontrolou zůstatku (kontrola a zápis nejsou v jedné transakci). Rozpočty nastavené pro jednotlivá období (`budgets`) jsou vázané na datum začátku; po změně období zůstávají u původních dat a nové období použije výchozí rozpočet. Pravidelné platby a jídelníček zůstávají kalendářní.

## 1. Cíl

Rozpočet není pouze přehled historických výdajů. Je to plánovací a řídicí centrum, které uživateli umožňuje:

1. plánovat každé rozpočtové období,
2. sledovat skutečné a plánované peníze odděleně,
3. evidovat pravidelné platby a pojištění,
4. plánovat úspory,
5. vytvářet účelové úspory („Kapsy“),
6. sledovat skutečný i očekávaný stav peněz,
7. rozhodovat o využití přebytku na konci období,
8. řešit schodek,
9. přenášet přebytek nebo schodek do následujícího období,
10. propojit rozpočet s nákupy, zásobami, akcemi a plánováním jídel.

## 2. Základní struktura Rozpočtu

Hlavní části:

- **Přehled**
- **Výdaje**
- **Plánování**

Nastavení rozpočtu a rozpočtových období patří do:

**Rozpočet → Plánování**

Nemají být samostatnou položkou v Profilu.

## 3. Rozpočtové období

Rozpočet není pevně navázán na kalendářní měsíc.

Uživatel si zvolí, jaké období pro něj představuje jeden rozpočtový cyklus:

- **Kalendářní měsíc** — například 1.–31.
- **Období podle výplaty** — například 15.–14. následujícího měsíce.
- **Vlastní období** — uživatel může nastavit vlastní začátek a délku období.

Kalendářní měsíc je pouze výchozí možnost.

### 3.1 Období podle výplaty

Pokud uživatel dostává výplatu 15. den v měsíci, může nastavit:

**15. 10. – 14. 11.**

Nové období začíná dnem výplaty.

Pokud očekávaná výplata ještě nebyla skutečně přijata, je pouze **plánovaným příjmem**. Po skutečném přijetí se převede na skutečný příjem.

### 3.2 Jednotná logika období

Celá logika Rozpočtu musí pracovat s pojmem **rozpočtové období**, nikoliv přímo s pojmem „měsíc“.

Zvolené období musí respektovat:

- příjmy,
- výdaje,
- pravidelné platby,
- pojištění,
- úspory,
- Kapsy,
- rozpočty,
- převody,
- uzavření období,
- statistiky,
- predikce,
- upozornění.

**Rozpočtové období = období, podle kterého uživatel reálně hospodaří se svými penězi.**

## 4. Přehled

Přehled zobrazuje aktuální rozpočtové období.

Má obsahovat zejména:

- skutečné příjmy,
- plánované příjmy,
- plánovaný rozpočet,
- skutečné výdaje,
- plánované výdaje,
- skutečný zůstatek,
- dostupný zůstatek,
- predikovaný zůstatek,
- volné peníze,
- pravidelné platby,
- plánované úspory,
- skutečně provedené úspory,
- Kapsy a jejich stav,
- případný převod z předchozího období,
- upozornění na očekávaný schodek nebo nedostatek prostředků.

## 5. Výdaje

Výdaje jsou skutečné nebo plánované finanční operace.

Typické kategorie:

- potraviny,
- bydlení,
- energie,
- doprava,
- děti,
- zdraví,
- pojištění,
- předplatné,
- telefon,
- ostatní.

Výdaj může být:

- jednorázový,
- opakovaný / pravidelný,
- plánovaný,
- skutečně uskutečněný.

Výdaj se při skutečném uskutečnění převede z plánovaného na skutečný a nesmí být započítán dvakrát.

## 6. Pravidelné platby a pojištění

Rozpočet podporuje pravidelné finanční závazky:

- nájem,
- energie,
- telefon,
- předplatné,
- životní pojištění,
- úrazové pojištění,
- penzijní pojištění,
- pojištění domácnosti,
- pojištění vozidla,
- jiné pojištění.

Interval může být:

- měsíční,
- čtvrtletní,
- pololetní,
- roční,
- vlastní.

Velké nepravidelné platby musí být zahrnuty do budoucího plánování, aby ANITKA dokázala upozornit na budoucí nedostatek prostředků.

## 7. Plánování

V části **Plánování** uživatel nastavuje a kontroluje jednotlivá rozpočtová období.

Pro každé období lze plánovat:

- příjmy,
- rozpočet,
- výdaje,
- pravidelné platby,
- úspory,
- cíle,
- převod z předchozího období,
- očekávaný výsledek.

Lze plánovat aktuální i budoucí období.

## 8. Skutečné vs. plánované peníze

Toto je základní pravidlo celé logiky.

### Skutečné peníze

Jsou peníze, které:

- byly skutečně přijaty,
- byly skutečně utraceny,
- byly skutečně převedeny do Kapsy nebo jiného účelu.

### Plánované peníze

Jsou očekávané budoucí:

- příjmy,
- výdaje,
- pravidelné platby,
- úspory,
- převody.

Plánované peníze nesmí měnit skutečný zůstatek.

### Predikce

Predikce kombinuje skutečný současný stav s očekávanými budoucími operacemi.

Každá plánovaná operace může přejít:

**Plánováno → Skutečné**

Po přechodu musí být původní plánovaná operace označena jako splněná / nahrazená skutečnou operací, aby nedošlo k dvojímu započítání.

## 9. Definice zůstatků

### 9.1 Skutečný zůstatek

**Skutečný zůstatek = skutečně přijaté peníze − skutečně uskutečněné výdaje − skutečně provedené převody.**

Plánované příjmy a výdaje se do něj nezapočítávají.

Příklad:

- skutečné příjmy: 38 000 Kč
- skutečné výdaje: 31 200 Kč
- skutečný převod do Kapsy: 2 000 Kč

→ skutečný zůstatek: **4 800 Kč**

### 9.2 Dostupný zůstatek

**Dostupný zůstatek = skutečný zůstatek − částky již vyhrazené na budoucí závazky.**

Je to částka, kterou může uživatel bezpečně použít.

Příklad:

- skutečný zůstatek: 6 800 Kč
- vyhrazené budoucí závazky: 3 800 Kč

→ dostupný zůstatek: **3 000 Kč**

### 9.3 Plánovaný zůstatek

**Plánovaný zůstatek = plánované příjmy − plánované výdaje − plánované převody do úspor.**

Slouží pouze pro plánování.

### 9.4 Predikovaný zůstatek

**Predikovaný zůstatek = skutečný zůstatek + očekávané příjmy − očekávané výdaje − plánované budoucí převody.**

Ukazuje očekávaný stav na konci období.

### 9.5 Volné peníze

**Volné peníze = skutečný zůstatek − částky vyhrazené na závazky − částky již určené k jinému účelu.**

Pouze volné peníze lze na konci období rozdělovat mezi:

- Kapsy,
- finanční rezervu,
- následující období.

**Plánovaný zůstatek není skutečný zůstatek. Predikovaný zůstatek není skutečný zůstatek. Skutečný zůstatek není automaticky totéž co volné peníze.**

## 10. Úspory

Úspory nejsou běžný výdaj.

Rozdíl:

- **výdaj** = peníze jsou spotřebovány,
- **úspora** = peníze jsou odloženy pro budoucí použití.

Plánovaná úspora nesnižuje skutečný stav, dokud není převod skutečně proveden.

Rozpočet musí rozlišovat:

- plánovanou úsporu,
- skutečně uloženou částku,
- zůstatek úspor.

## 11. Úsporné Kapsy

„Kapsa“ je účelově určená část peněz.

Příklady:

- Auto,
- Finanční rezerva,
- Vánoce,
- Dovolená.

Kapsa může obsahovat:

- název,
- ikonu,
- cílovou částku,
- termín,
- počáteční částku,
- plánovaný měsíční / periodický příspěvek,
- skutečně uloženou částku,
- aktuální zůstatek.

ANITKA může vypočítat doporučený příspěvek.

Příklad:

**Cíl: 150 000 Kč do prosince 2027**

→ ANITKA doporučí přibližnou pravidelnou částku potřebnou k dosažení cíle.

### 11.1 Plánovaná vs. skutečná úspora

Plánovaný příspěvek do Kapsy nezvyšuje její skutečný zůstatek.

Teprve skutečně provedený převod:

**Rozpočet → Kapsa**

zvýší zůstatek Kapsy.

## 12. Konec rozpočtového období

Na konci období ANITKA vyhodnotí skutečný výsledek.

### Kladný výsledek

Příklad:

- příjmy: 38 000 Kč
- výdaje: 33 200 Kč
- volné peníze: 4 800 Kč

ANITKA zobrazí:

**„Skutečně vám zůstalo 4 800 Kč. Co s nimi chcete udělat?“**

Uživatel může například zvolit:

- Auto: +2 000 Kč
- Finanční rezerva: +1 500 Kč
- následující období: +1 300 Kč

Uživatel může doporučení ANITKY změnit.

### Záporný výsledek

Příklad:

- příjmy: 38 000 Kč
- výdaje: 40 300 Kč
- schodek: −2 300 Kč

ANITKA zobrazí:

**„Toto období máte schodek 2 300 Kč. Jak ho chcete pokrýt?“**

Možnosti:

- finanční rezerva,
- jiná Kapsa,
- následující období,
- kombinace možností.

## 13. Pravidla záporného zůstatku

Záporný výsledek znamená, že skutečné výdaje převýšily dostupné prostředky.

Schodek:

- není volná částka,
- nesmí být převeden do Kapsy jako úspora,
- nesmí být prezentován jako disponibilní peníze,
- musí být pokryt nebo převeden jako deficit do následujícího období.

Pokud existují plánované úspory a současně schodek, ANITKA může nabídnout odložení těchto úspor.

### Priorita při schodku

1. pokrýt schodek,
2. zajistit nutné a plánované závazky,
3. teprve potom vytvářet nové úspory.

## 14. Převod mezi obdobími

Kladný i záporný převod používají **jeden společný mechanismus**.

**Převod mezi obdobími je samostatná finanční operace, která přenáší část výsledku jednoho období do bezprostředně následujícího období.**

Může být:

- **kladný (+)** — přebytek,
- **záporný (−)** — schodek.

### Základní pravidlo

**Převod není příjem, výdaj ani úspora. Pouze upravuje dostupné prostředky následujícího období.**

### Výpočet nového období

**Dostupné prostředky = skutečné příjmy + převod z předchozího období**

Příklad:

Výplata: **38 000 Kč**  
Převod: **+1 800 Kč**

→ dostupné prostředky: **39 800 Kč**

Nebo:

Výplata: **38 000 Kč**  
Převod: **−2 300 Kč**

→ dostupné prostředky: **35 700 Kč**

### Původ převodu

Převod vzniká při uzavření období z jeho skutečného výsledku.

Kladný výsledek se rozdělí například mezi:

- Kapsy,
- rezervu,
- následující období.

Pouze část explicitně určená pro následující období se zapíše jako kladný převod.

Stejně tak při schodku se pouze část skutečně ponechaná k úhradě v následujícím období zapíše jako záporný převod.

### Limity převodu

- Kladný převod nesmí být vyšší než skutečný přebytek dostupný k převodu.
- Záporný převod nesmí být vyšší než skutečný nepokrytý schodek.
- Převod nesmí vytvořit peníze, které neexistují.

### Plánovaný převod

Převod lze plánovat dopředu.

Dokud není předchozí období uzavřeno, jde pouze o očekávaný / plánovaný převod.

Po uzavření období se nahradí skutečným převodem podle skutečného výsledku.

Příklad:

Plánovaný převod: **+2 000 Kč**  
Skutečný přebytek při uzavření: **+1 500 Kč**

→ skutečný převod: **+1 500 Kč**

### Změna uzavřeného období

Pokud se po uzavření období změní skutečné údaje, musí se přepočítat:

1. skutečný výsledek období,
2. převod do následujícího období,
3. dostupné prostředky následujícího období,
4. všechny navazující predikce.

Příklad:

Původní převod: **+1 800 Kč**  
Dodatečný výdaj: **500 Kč**

→ nový převod: **+1 300 Kč**

### Návaznost období

Standardní převod jde pouze do bezprostředně následujícího období:

**říjen → listopad → prosinec**

Převod nemá sloužit k přesunu peněz z října přímo do března.

Pro dlouhodobé odkládání peněz se používají Kapsy a cíle.

### Zákaz dvojího započítání

Převod se nikdy nesmí znovu započítat jako:

- příjem,
- výdaj,
- úspora.

Je to samostatný typ finanční operace.

## 15. Uzavření období

Při uzavření období ANITKA:

1. vyhodnotí skutečné příjmy,
2. vyhodnotí skutečné výdaje,
3. vypočítá skutečný výsledek,
4. odečte již provedené účelové převody,
5. určí skutečné volné peníze,
6. nabídne jejich rozdělení,
7. vytvoří případné převody do následujícího období,
8. aktualizuje Kapsy a rezervy,
9. přepočítá navazující období.

Uzavřené období zůstává dostupné pro historii.

## 16. Predikce schodku

ANITKA nesmí čekat až na vznik skutečného schodku.

Pokud:

**predikovaný zůstatek < 0**

má uživatele upozornit předem.

Příklad:

**„Podle vašeho plánu vám na konci období bude chybět přibližně 2 300 Kč.“**

ANITKA může nabídnout:

- snížení plánovaných výdajů,
- odložení plánované úspory,
- využití Kapsy,
- využití rezervy,
- změnu plánovaných plateb,
- očekávaný záporný převod do dalšího období.

## 17. Automatická doporučení ANITKY

ANITKA může podle dat navrhovat:

- kolik odložit do jednotlivých Kapes,
- kolik ponechat na další období,
- zda je vhodné posílit rezervu,
- zda plánovaná úspora není příliš vysoká,
- zda hrozí schodek,
- zda bude problém s budoucí pravidelnou platbou,
- zda je vhodné upravit plánované výdaje.

Doporučení nesmí automaticky přesouvat skutečné peníze bez potvrzení uživatelem.

## 18. Historie období

Uživatel musí mít možnost zobrazit předchozí rozpočtová období, nejen aktuální.

Historie může zobrazovat:

- rozpočet,
- příjmy,
- výdaje,
- skutečný výsledek,
- úspory,
- převod do dalšího období,
- případný schodek.

Výsledky musí odpovídat skutečně zvoleným rozpočtovým obdobím, včetně období podle výplaty.

## 19. Propojení s ostatními funkcemi

Rozpočet musí být propojen s:

- **Nákupy** — plánované nákupy ovlivňují plánované výdaje.
- **Zásoby** — dostupné zásoby mohou ovlivnit potřebu nákupu.
- **Akce** — výhodnější nákup může ovlivnit predikované výdaje.
- **Jídelníček** — plánované recepty mohou generovat očekávané nákupní potřeby.
- **Kapsy** — skutečné převody mění stav účelových úspor.
- **Upozornění** — rozpočet generuje upozornění na překročení, nedostatek nebo blížící se závazky.

## 20. Datová a výpočetní pravidla

### Rozpočet období

Rozpočet období je vlastní hodnota daného období, pokud ji uživatel nastavil. Jinak se použije výchozí rozpočet domácnosti.

Jedna centrální funkce musí určovat rozpočet pro konkrétní období, aby stejnou hodnotu používaly:

- rozpočtová karta,
- upozornění 80 % / 100 %,
- přehled,
- statistiky,
- plánování.

### Úspora období

Pro účely historického přehledu:

**Ušetřeno = rozpočet období − skutečné výdaje období**

Pokud je výsledek záporný, jde o překročení rozpočtu.

Toto číslo není totéž jako dlouhodobé finanční úspory nebo úspory na akcích.

### Historické výpočty

Historická období mají být načítána efektivně.

Nemá se při otevření Rozpočtu načítat kompletní historie všech jednotlivých výdajů.

Preferovaný princip:

1. agregovat souhrny podle období,
2. detailní výdaje načíst až po otevření konkrétního období.

Tím se omezuje zatížení databáze a compute.

## 21. UX principy

Rozhraní musí vždy jasně rozlišovat:

- **Skutečně**,
- **Plánováno**,
- **Predikce**.

Uživatel nesmí mít dojem, že plánovaný příjem již má k dispozici.

Příklady:

**Skutečný zůstatek: 6 800 Kč**

**Po vyhrazení budoucích závazků vám zbývá: 3 000 Kč**

**Očekávaný konečný stav: 800 Kč**

**Převod z předchozího období: +1 800 Kč**

**Převod z předchozího období: −1 800 Kč**

## 22. Kompletní princip

Rozpočet funguje jako uzavřený cyklus:

**Příjmy → plán → skutečné výdaje → skutečný výsledek → rozdělení výsledku → převod / Kapsy / rezerva → následující období → nový plán**

Základní pravidlo:

> **Při uzavření období se skutečný výsledek rozdělí mezi Kapsy, rezervu a následující období. Část určená pro následující období se zapíše jako převod. Kladný převod zvyšuje jeho dostupné prostředky, záporný převod je snižuje.**

Rozpočet tedy není pouze historie utrácení. Je to systém pro plánování, průběžné řízení a predikci finančního stavu domácnosti podle období, ve kterém uživatel skutečně hospodaří.
