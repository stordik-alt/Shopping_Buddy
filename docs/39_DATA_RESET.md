# 39 — Smazání uživatelských dat domácnosti (reset dat)

Funkce pro **správce domácnosti** (roli `owner`): v Profilu, záložka Domácnost, blok „Smazání dat“. Smaže vybraná uživatelská data a nechá celý profil: domácnost, členy a děti, stravování, preference, vybrané obchody, nastavení upozornění, místa a hlídání zásob a nastavení rozpočtového období. Smazání je **nevratné**.

## Co jde vybrat

Správce zaškrtne, co chce smazat (nic není předzaškrtnuté, je tam „Vybrat vše“). Skupiny jsou nezávislé; jejich seznam a popisy jsou v `lib/data-reset.ts`.

| Skupina | Smaže se |
|---|---|
| `shopping` Nákupní seznamy | položky všech seznamů a seznamy navíc; jeden (nejstarší) prázdný seznam zůstane, aplikace jeden potřebuje |
| `purchases` Nákupy a účtenky | historie nákupů s položkami, účtenky včetně fotek v R2 a **výdaje, které z nákupů vznikly** (databáze je maže kaskádou) |
| `expenses` Výdaje | všechny výdaje (i ručně zapsané) |
| `incomes` Příjmy | plánované i přijaté příjmy |
| `budget` Rozpočet a plánování | měsíční limity a cíl úspor (v domácnosti se vynulují), limity kategorií, plánované výdaje a přenosy, Kapsy s převody, pravidelné platby, uzavřená období |
| `pantry` Zásoby | položky zásob a odmítnutá doporučení k dokoupení; místa, intervaly kontroly a hlídané zásoby jsou nastavení a zůstanou |
| `recipes` Recepty a jídelníčky | oblíbené recepty, historie otevřených receptů, týdenní jídelníčky |
| `notifications` Oznámení | oznámení ve zvonku (odběry push a volba upozornění zůstanou) |

Historie změn (`audit_log`) se nemaže: je to záznam o odpovědnosti a o resetu do ní přibude řádek „Smazal(a) data domácnosti“.

## Autorizace a potvrzení

- Akce `resetHouseholdDataAction` (`app/actions/data-reset.ts`) bere domácnost a roli výhradně ze session (`requireHousehold`), `assertOwner` odmítne člena. Klient neposílá žádné id.
- Vybrané skupiny se na serveru ověří proti pevnému seznamu; prázdný výběr se odmítne.
- Potvrzení: správce musí opsat **název domácnosti** (porovnává server, ne klient). Dialog je červený s varováním o nevratnosti a tlačítko „Smazat navždy“ je červené a do opsání nepovolené.
- Omezení četnosti: 5 pokusů za 10 minut.

## Provedení

`lib/db/data-reset.ts`: všechna mazání z vybraných skupin proběhnou v jednom `db.batch` (atomicky; Neon HTTP nemá interaktivní transakce). Fotky účtenek se mažou z R2 až po databázi; nepovedené smazání fotky se jen zaloguje a vrátí se jejich počet (stejný postup jako u smazání účtu). Skupiny na sobě nezávisí, kromě toho, že smazání nákupů smaže i z nich vzniklé výdaje.

Po úspěchu dialog smaže offline kopii stránek a znovu načte aplikaci, aby žádná obrazovka neukazovala smazaná data.

## Testy

`lib/data-reset.test.ts` (čistá pravidla) a `lib/db/data-reset.test.ts` (skutečná databáze: smaže jen vybrané skupiny, profil a jiné domácnosti zůstanou, nákupy odnesou i své výdaje a fotky, seznam zůstane jeden prázdný, rozpočet se vynuluje).
