# Chybějící funkce mobilní aplikace vůči PWA

**Datum kontroly:** 2026-10-24  
**Kontrolovaná větev:** `main`  
**Kontrolovaný commit:** `4d63cea1078c85b8b32df298cd62103f681b35ce`  
**Rozsah:** porovnání uživatelských funkcí PWA s obrazovkami a mobilním API v `apps/mobile`. Jde o kontrolu zdrojového kódu, ne o vizuální test každé funkce na telefonu.

## Aktuální end-to-end audit — 2026-11-02

Tato část je novější než tabulky níže a zachycuje skutečný průchod PWA a nativní Android aplikace. Původní tabulky ponechávám jako historii auditu z 2026-10-24; některé v nich uvedené mezery už byly mezitím doplněny.

### Prostředí a rozsah

- Checkout: `4076ad703eec` (`main`) s rozpracovanými mobilními změnami, které audit nepřepisoval.
- PWA: Next.js 16.4.2 na `http://localhost:3000` nad izolovanou databází `shopping_buddy_test`.
- Playwright: scénář `e2e/smoke.spec.ts` prošel (`2 passed`) s prodlouženým limitem 240 s; prošel registrací, ověřením testovacím fixture, přihlášením, průvodcem a hlavními sekcemi.
- Android: AVD `ANITKA_API35`, Android 15, x86_64, aplikace `cz.shoppingbuddy.mobile`; build byl vytvořen příkazem `./gradlew assembleDebug -PreactNativeArchitectures=x86_64`.
- Nativní API bylo přes `adb reverse tcp:3000 tcp:3000` připojené na lokální backend. Pro lokální auth musí být použit origin `http://localhost:3000`; `http://127.0.0.1:3000` vrací `403 INVALID_ORIGIN`.
- Byl projit účet `mobile.audit.20261102@example.com` v domácnosti „Vizuální domácnost“ s třemi položkami seznamu, jednou položkou zásob a jedním výdajem.
- Ověřené obrazovky v obou motivech: Domů, Nákupní seznam, Účtenky, Zásoby, Rozpočet, Plán, Akce, Obchody, Recepty, Jídelníček, Profil, chat a tři kroky průvodce.

### Uložené důkazy a stav

- PWA snímky: `test-results/mobile-parity/pwa/` — 30 snímků (15 obrazovek × světlý/tmavý motiv).
- Android snímky: `test-results/mobile-parity/native/light/` a `test-results/mobile-parity/native/dark/` — 30 snímků.
- Párové snímky a kontaktní listy: `test-results/mobile-parity/comparison/` — 30 párů a dva kontaktní listy.
- Responzivní PWA sada: `test-results/mobile-ui-v2/` — 40 snímků ve více šířkách a motivech.
- Playwright stav přihlášeného účtu: `test-results/mobile-audit/pwa/storage-state.json`. Jde o lokální testovací artefakt, ne o soubor k verzování.
- Android stav zůstává v zastaveném kontejneru `anitka-avd-session`; databázový kontejner je `anitka-pg`. Oba lze znovu spustit příkazem `docker start`.

### Co v Android aplikaci chybí nebo se chová odlišně

| Priorita | Oblast | Zjištění | PWA jako referenční chování | Android jako místo opravy |
|---|---|---|---|---|
| Opraveno 2026-11-02 | Zásoby — prázdný obsah | Akce v hlavičce se snažily zůstat v jednom neflexibilním řádku; text „Zařadit automaticky“ se zlomil do vysokého bloku a odsunul místa i položky mimo obrazovku. Hlavička je nyní dvouřádková, akce se zalamují a místa používají responzivní mřížku. Ověřeno na Android emulátoru: zobrazí se šest míst, počty a položka Rýže. | Zobrazí místa s počty a kartu položky Rýže s ovládáním množství. | `apps/mobile/components/pantry-screen.tsx`. |
| Opraveno 2026-11-02 | Nákupní seznam — zobrazení | Přidány filtry textu a kategorie, skrytí hotových položek, řazení podle názvu/priority, seskupení podle kategorie/obchodu a uložení volby v zařízení. Přidán přepínač „Nechat displej svítit“. | `components/shopping/shopping-list.tsx`, `lib/list-view-preference.ts` a wake lock v PWA. | `apps/mobile/app/index.tsx`, `apps/mobile/lib/shopping-list-view.ts`; pokryto unit testy. |
| Opraveno 2026-11-02 | Domů — pořadí a viditelnost akcí | Rychlé akce jsou nyní hned po rozpočtu a nákupním seznamu, tedy na první obrazovce. PWA používá jednu kartu se čtyřmi ikonovými dlaždicemi; Android má stejné seskupení, rozměry dlaždic a barvu ikon místo čtyř samostatných karet. | `QuickActions` a `DashboardOverview` v PWA. | `NativeHomeScreen` v `apps/mobile/components/native-parity-screens.tsx`. |
| Opraveno 2026-11-02 | Domů a Rozpočet — rozpočtová karta | Android používá stejný tmavý budget hero jako PWA, včetně varování od 80 %, překročení limitu, denního zůstatku, počtu dní a CTA „Nastavit rozpočet“. Domů i Rozpočet sdílejí jednu nativní komponentu. CTA z Domů otevře přímo plánování rozpočtu. | `BudgetHero` a `BudgetOverview` v PWA. | `NativeBudgetHero`; `NativeHomeScreen` a `BudgetScreen`. |
| Opraveno 2026-11-02 | Domů, Profil a Recepty — přetečení | Datum na Domů doplňuje rok a píše český měsíc malým písmenem. Sekce Profilu se zalamují, takže je vidět i „Upozornění“. Filtry a zdroje receptů se zalamují místo vodorovného skrývání posledních voleb. | Datum, wrapované sekce a filtry v PWA. | `NativeHomeScreen`, `NativeProfileScreen` a `RecipesScreen`. |
| Opraveno 2026-11-02 | Domů — „Dnes je důležité“ | Všechna aktuální upozornění jsou v jedné kompaktní zvýrazněné kartě s nadpisem; každý řádek zůstává samostatně klikatelný a vede na stejný cíl jako dřív. | `TodayAttention` v PWA. | `NativeHomeScreen`. |
| Opraveno 2026-11-02 | Recepty — rychlé filtry | Android doplňuje stejnou řadu „Rychlé, Večeře, Oběd, Polévky, Maso, Těstoviny, Dezerty, Bezmasé“. Klepnutí nastaví hledaný výraz a okamžitě spustí vyhledání, stejně jako PWA. | `QUICK_FILTERS` a `applyQuickFilter` v `components/recipes/recipes.tsx`. | `RecipesScreen` v `apps/mobile/components/recipes-screen.tsx`. |
| Opraveno 2026-11-02 | Obchody — poloha v okolí | Android nabízí volitelné foreground oprávnění a tlačítko „Použít mou polohu“. Mobilní API přijímá validované `lat`/`lng`, hledá v okruhu 5 km, vrací vzdálenost prodejen a GPS dotazy záměrně necachuje. Bez města i polohy se zobrazí stejný výchozí dotaz jako v PWA místo celostátního seznamu. | `useUserLocation`, `StoreDirectory` a `storeChainTilesAction` v PWA. | `NativeStoresScreen`, `expo-location`, `app/api/mobile/stores/route.ts`; CI grantuje oprávnění a nastavuje emulátorovou polohu Prahy. |
| Opraveno 2026-11-02 | Zásoby — přehled a filtrování | Místa používají responzivní mřížku se šesti položkami. Přidán filtr podkategorie a přepínač zobrazení/skrytí spotřebovaných položek. | `components/shopping/pantry.tsx`. | `PantryScreen`. |
| Opraveno 2026-11-02 | Nákup — úpravy položky | Editor nyní mění kategorii, preferovaný obchod, prioritu, poznámku, množství i jednotku. Metadata se ukládají offline frontou a mobilní route validuje povolená pole. | Detail/editace položky seznamu v PWA. | `apps/mobile/app/index.tsx`, `apps/mobile/lib/shopping-list-api.ts`, `apps/mobile/lib/offline-shopping-list.ts`, `app/api/mobile/shopping-list/[itemId]/route.ts`. |
| Částečně opraveno | Vizuální kompatibilita obrazovek | Hlavní přetečení, budget hero, rychlé akce, profilové sekce, datum, rychlé filtry receptů a poloha obchodů jsou srovnané s PWA. Android záměrně používá některé nativní přepínače, diálogy a systémové prvky. Zbývají hlavně jemné rozdíly v rozestupech, výšce karet a zarovnání textu mezi odpovídajícími obrazovkami. | Mobilní breakpointy PWA a `docs/14_MOBILE_UI_V2_SPEC.md`. | Pokračovat vizuální kontrolou párových snímků; nejde o chybějící funkci. |

### Co bylo na Androidu ověřeno jako funkčně přítomné

- Recepty už obsahují hledání, zdroje, oblíbené, nedávné, doporučení podle zásob, porce, výběr surovin a ocenění.
- Jídelníček obsahuje vytvoření plánu, změnu porcí a označení jídla jako uvařeného.
- Účtenky obsahují nahrání/import, kontrolu OCR i návrhy odškrtnutí nákupního seznamu.
- Rozpočet obsahuje přehled, výdaje, plán, pravidelné platby, srovnání, projekci, úspory, kapsy i uzavření období.
- Profil obsahuje domácnost, členy, děti, pozvánky, stravovací preference, nastavení zásob a vzhledu.
- AI chat je dostupný, ale stejně jako v PWA oznamuje, že AI asistent zatím není připojený.

### Omezení tohoto průchodu

- Snímky Androidu vznikaly na softwarově virtualizovaném emulátoru. První spuštění bylo výrazně pomalejší než PWA a některé obrazovky bylo nutné přetáčet po dokončení asynchronního načtení.
- PWA smoke scénář používá vlastní dočasný účet. Pro Android byl použit samostatný vizuální fixture účet; vizuální srovnání proto ověřuje především layout, texty a stavy, zatímco některé údaje vázané na účet se mohou lišit.
- V lokální testovací databázi se v části seznamu obchodů objevila fixture jména typu `test-user1`; tento záznam je datová anomálie testovací databáze, nikoli potvrzená funkční mezera Android aplikace.
- Kamera, skutečné OCR volání, push notifikace, externí odkazy, offline přechod v režimu letadlo a obnova po restartu zařízení nebyly v této lehké části auditu znovu prováděny.

## Výsledek implementace PR #622 (2026-10-25)

Auditní tabulka níže zachycuje původní stav před implementací. Funkční mezery v ní uvedené jsou doplněné; její zjištění proto nepředstavují aktuálně chybějící funkce.

| Oblast | Doplněno | Stav |
|---|---|---|
| Zásoby | Změna kategorie, podkategorie, druhu produktu a četnosti kontroly, automatické zařazení a úprava obsahu balení. | Hotovo |
| Jídelníček | Označení jídla jako uvařeného přes sdílenou idempotentní logiku odečtu zásob. | Hotovo |
| Recepty | Oblíbené a nedávné recepty, doporučení podle zásob, filtry a řazení, změna porcí, výběr surovin do seznamu, ceny a návrh obchodu. | Hotovo |
| Účtenky a seznam | Serverové návrhy shod po importu a potvrzení pouze vybraných položek. | Hotovo |
| Rozpočet | Měsíční přehled úspor, srovnání tempa s předchozím obdobím a projekce do konce období. | Hotovo |
| Účet | Nativní registrace, ověření e-mailu a obnova hesla přes Neon Auth. | Hotovo |
| Navigace | Předání ID cílové účtenky nebo položky zásob z domovské obrazovky. | Hotovo |

PR #622 byl sloučen do `main` jako `cf544a9471024709175966b0acc67e6d635c1867`; všechny jeho CI kontroly prošly. Vizuální shoda nativních obrazovek s PWA se v tomto PR neověřovala emulátorem. Aktuální pokrytí screenshoty a plánované nativní vizuální ověření popisuje changelog.

## Vizuální ověření Expo aplikace

Aktualizovaný Playwright smoke test pořizuje snímky 8 hlavních obrazovek, účtenek, jídelníčku, plánování rozpočtu, AI chatu a tří kroků průvodce (úvod, navigace, ukázka pole nákupního seznamu). Nativní Android průchod Maestro pořizuje stejné obrazovky ve světlém i tmavém motivu. Porovnávací skript vyžaduje všech 15 dvojic pro každý motiv, snímky Androidu normalizuje na 390 × 844 px a připravuje dvojice vedle sebe i kontaktní listy jako CI artefakt.

CI run [40249081377](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/40249081377) pořídil všech 30 snímků PWA a 30 odpovídajících snímků Androidu (15 obrazovek ve světlém a tmavém motivu); všechny byly vykreslené a vzniklo 30 porovnávacích dvojic. Vizuální kontrola potvrdila, že maskot u zprávy AI chatu je svisle vycentrovaný vedle bubliny jako v PWA. Zároveň odhalila, že mobilní průvodce měl maskota na opačné straně karty. Nativní průvodce je nyní upraven na pořadí PWA: text vlevo, maskot vpravo; nový CI běh pořídí opravné snímky pro závěrečnou kontrolu.

Kontrola úplnosti a generování dvojic samo o sobě nezaručuje shodu pixelů; kontaktní listy se před sloučením PR vizuálně kontrolují. Android běží v CI emulátoru. iOS není v CI screenshoty pokrytý a zůstává ruční kontrolou.

## Potvrzené funkční mezery

| Priorita | Oblast | Co v mobilní aplikaci chybí | Stav PWA / ověřené místo |
|---|---|---|---|
| Vysoká | Zásoby | Detail položky neumí měnit kategorii, podkategorii, druh produktu ani četnost sledování. Chybí také automatické zařazení a úprava množství jednotlivých obsahů/balení. Mobil umí položky zobrazit, přidat, přesunout, upravit jejich celkové množství, odebrat a hromadně zkontrolovat. | PWA nabízí tyto operace v detailu zásoby a akci „Automaticky zařadit“ (`components/shopping/pantry.tsx`, `components/shopping/pantry-detail.tsx`). Mobilní `PantryScreen` zatím používá jen základní operace (`apps/mobile/components/pantry-screen.tsx`). |
| Vysoká | Recepty | Mobilní vyhledávání a detail receptu nemají oblíbené recepty ani historii, doporučení podle dostupných zásob, pokročilé filtry a řazení, úpravu porcí v detailu ani výběr chybějících surovin k přidání na seznam. Chybí také ocenění receptu, ceny surovin a návrh nejlevnějšího obchodu. | PWA tyto funkce poskytuje v `components/recipes/recipes.tsx` přes akce v `app/actions/recipes.ts`. Mobilní `RecipesScreen` nabízí základní hledání, detail surovin a odkaz na původní recept; mobilní Recipe API zatím pokrývá vyhledání a detail (`apps/mobile/components/recipes-screen.tsx`, `app/api/mobile/recipes/route.ts`). |
| Vysoká | Jídelníček | U naplánovaného jídla nelze v mobilu zvolit „Uvařeno“. Mobil proto neodečte spotřebované suroviny ze zásob a neuloží stav uvaření. | PWA má `markMealCookedAction`, která idempotentně označí jídlo jako uvařené a aktualizuje zásoby (`app/actions/meal-plan.ts`). Mobilní obrazovka stav pouze zobrazuje; její API nabízí načtení, vytvoření plánu a změnu porcí, ne označení uvaření (`apps/mobile/components/meal-plan-screen.tsx`, `app/api/mobile/meal-plan/`). |
| Vysoká | Účtenky a seznam | Po dokončení importu účtenky mobil nenabídne rozpoznané vazby mezi nakoupenými položkami a otevřenými položkami seznamu. Uživatel je proto musí na seznamu odškrtnout ručně. | PWA nabízí navržené shody, jejich potvrzení a promítnutí skutečné ceny a množství do seznamu (`components/shell/use-receipts.ts`, `components/budget/receipt-list-suggestions.tsx`). Odpovídající mobilní klientská funkce a API zatím nejsou. Samotné nahrání, OCR, kontrola, duplicity a zrušení importu v mobilu podporované jsou. |
| Střední | Rozpočet | Chybí přehled skutečně zaznamenaných úspor z nákupů po měsících. V mobilním přehledu také není srovnání útraty se stejnou částí předchozího období ani odhad útraty do konce období a souhrn plánovaných proti skutečným výdajům v podobě, kterou nabízí PWA. | PWA má `PurchaseSavingsCard` a srovnání/projekci v `components/budget/budget-overview.tsx`. Mobilní rozpočet pokrývá výdaje, kategorie, limity, plánování, pravidelné platby, příjmy a pokročilé nastavení období, ale tento souhrn ani mobilní endpoint pro měsíční úspory nemá (`apps/mobile/components/budget-screen.tsx`, `apps/mobile/lib/shopping-list-api.ts`). |
| Střední | Přihlášení a účet | Nativní aplikace nemá vlastní registraci, ověření e-mailu ani obnovu hesla. Registraci pouze odkazuje na webovou PWA; nový uživatel tedy musí dokončit založení a ověření účtu mimo aplikaci. | Nativní obrazovka obsahuje přihlášení a externí odkaz na registraci, ne další autentizační obrazovky (`apps/mobile/app/index.tsx`). Tento požadavek je také zaznamenán v `docs/40_MOBILE_INTERNAL_RELEASE_AUDIT.md`. |
| Nižší | Domů a navigace na konkrétní záznam | Upozornění a doporučení na domovské obrazovce většinou otevřou pouze obecnou sekci. Mobil nepředá obrazovce přesný cíl, například konkrétní čekající účtenku nebo konkrétní položku zásob. | PWA předává některým navigačním akcím identifikátor cíle a otevře konkrétní záznam (`components/app-shell.tsx`). Mobilní `NativeHomeScreen` přepíná na obecnou sekci (`apps/mobile/components/native-parity-screens.tsx`). |

## Funkce, které se za chybějící nepovažují

- Nákupní seznam, obvyklé položky, vyhledání produktu, čárový kód, porovnání obchodů a offline fronta seznamu jsou v mobilu implementované.
- Mobil obsahuje obrazovky zásob, rozpočtu, akcí, obchodů, receptů, jídelníčku, účtenek a profilu domácnosti. Rozpočet zahrnuje také graf kategorií a pokročilé plánování; profil obsahuje nastavení domácnosti, členů, obchodů, upozornění a vzhledu.
- Import účtenek včetně OCR a nativní kontroly položek je implementovaný.
- AI chat není funkční ani v PWA na kontrolovaném commitu; jeho nedostupnost proto není rozdílem mezi aplikacemi.

## Doporučené pořadí doplnění

1. Dopsat ovládání detailu zásob a mobilní API pro chybějící úpravy položek.
2. Doplnit receptové kolekce, doporučení podle zásob a přidávání chybějících surovin do nákupu; následně ocenění a pokročilé filtry.
3. Přidat potvrzení „Uvařeno“ s bezpečným promítnutím spotřeby do zásob.
4. Přenést návrhy shod účtenky se seznamem a potvrzení vybraných shod.
5. Doplnit úspory a srovnávací/projekční souhrn rozpočtu.
6. Rozšířit autentizační tok nebo zachovat a jasně popsat přechod na web pro založení a obnovu účtu.
7. Přidat předávání cílových ID při navigaci z domovských upozornění.

## Omezení kontroly

Seznam vychází ze zdrojového kódu PWA a Expo aplikace na uvedeném commitu. Neověřuje skutečné chování každé obrazovky na Androidu/iOS. Automatický CI/build potvrzuje kompilaci a testované API, sám o sobě ale nepotvrzuje plnou funkční paritu ani průchod na zařízení.
