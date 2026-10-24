# Chybějící funkce mobilní aplikace vůči PWA

**Datum kontroly:** 2026-10-24  
**Kontrolovaná větev:** `main`  
**Kontrolovaný commit:** `4d63cea1078c85b8b32df298cd62103f681b35ce`  
**Rozsah:** porovnání uživatelských funkcí PWA s obrazovkami a mobilním API v `apps/mobile`. Jde o kontrolu zdrojového kódu, ne o vizuální test každé funkce na telefonu.

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
