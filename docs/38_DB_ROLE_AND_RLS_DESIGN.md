# Návrh: oddělená databázová role a RLS (S1)

**Datum:** 2026-10-13
**Stav:** návrh; vlastník 2026-10-13 rozhodl krok **přeskočit** (S1 je odložené), nic se neimplementuje. Dokument zůstává pro případný návrat. Žádný kód. Navazuje na `docs/35_SECURITY_AUDIT.md` (S1) a `docs/37_SECURITY_REMEDIATION_PLAN.md` (Fáze 3).

## 1. Proč a co by to mělo zajistit

Dnes se aplikace připojuje k Neon jako vlastník databáze. Cokoli, co se dostane k jejímu `DATABASE_URL`, nebo cokoli, co by v budoucím dotazu zapomnělo `where household_id = …`, vidí a může měnit **všechna** data všech domácností, může mazat tabulky a číst `neon_auth` (hashe hesel, tokeny relací).

Autorizaci dnes hlídá výhradně aplikace (`requireHousehold()` a filtr domácnosti v každém dotazu). To funguje, ale je to jediná vrstva. Cíl je druhá vrstva, která:

1. omezí, co může aplikační spojení vůbec dělat (žádné DDL, žádný `neon_auth`) — **role**,
2. odmítne dotaz, který by sáhl na cizí domácnost, i když v něm filtr chybí — **RLS**.

## 2. Zjištěný stav (z kódu)

* Připojení: Neon **HTTP** ovladač (`@neondatabase/serverless`, `lib/db/client.ts`). Každý dotaz je samostatný bezstavový požadavek. **Nemá interaktivní transakce** (Drizzle `transaction()` v `neon-http` vyhazuje chybu; to je právě chyba, kterou jsem dnes opravil v `lib/db/account-deletion.ts`). Atomicky jde jen `db.batch([...])` (14 míst v kódu). Lokální vývoj a CI používají `pg` pool.
* 271 volání `getDb()` v 66 souborech, 153 míst s `requireHousehold*`, 48 souborů akcí. Přepisovat volání po jednom je nereálné; jakékoli řešení musí fungovat **bez zásahu do jednotlivých dotazů**.
* 78 tabulek:
  * **33** má přímo `household_id` (`purchases`, `pantry_items`, `receipt_imports`, `budgets`, `notifications`, …),
  * **4** se váží přes člena (`profiles`, `member_stores`, `member_diets`, `member_notification_settings`),
  * **dalších ~10** přes rodiče bez vlastního `household_id` (`purchase_items`, `shopping_list_items`, `purchase_item_expense_splits`, `recurring_payment_occurrences`, `shopping_list_item_pins`, …),
  * zbytek jsou **globální** tabulky: katalog (`products`, `product_*`, `pkd_*`), obchody, `prices`, `deals`, `flyer_pages`, `rate_limits`, `app_admins`.
* Produkční kód `neon_auth` **nečte ani nepíše** (jen `lib/auth/local.ts` pro lokální vývoj a testy). Auth jde přes službu Neon Auth. Aplikační role tedy `neon_auth` vůbec nepotřebuje.
* Migrace se spouštějí automaticky v `pnpm build` na Vercelu (`lib/db/migrate.ts`) s `DATABASE_URL_UNPOOLED`.
* Cesty **bez** kontextu domácnosti, které by RLS rozbilo: rozhodnutí „která domácnost je moje“ (`household_members` podle `user_id` při každém požadavku), přijetí pozvánky podle tokenu (přes domácnosti), všechny crony (import cen, upozornění všem domácnostem, retence), obrazovky správce (nápady napříč domácnostmi, schvalování katalogu), smazání účtu, `rate_limits`.

## 3. Navržený postup ve třech krocích

Každý krok je samostatné PR a dá se nasadit i vrátit bez dalších. Kroky A a B jsou užitečné i samy o sobě.

### Krok A — oddělená role s nejnižšími právy (bez RLS)

Nejlevnější část s nejvyšším poměrem užitku k riziku.

* Nová role `app_runtime` (`LOGIN`, `NOBYPASSRLS`, `NOSUPERUSER`), vlastník schématu zůstává jiná role (dnešní vlastník), která dál dělá migrace.
* `app_runtime` dostane `SELECT/INSERT/UPDATE/DELETE` na tabulky v `public`, `USAGE` na sekvence a **nic** na `neon_auth`, žádné `CREATE`, `DROP`, `TRUNCATE`, `ALTER`. `ALTER DEFAULT PRIVILEGES` zajistí práva i na budoucí tabulky z migrací.
* Aplikace (Vercel runtime) dostane `DATABASE_URL` této role; migrace dál běží pod vlastníkem.
* Přínos: uniklý `DATABASE_URL` nebo SQL injection už nemůže smazat tabulky ani přečíst hashe hesel a tokeny relací.
* **Riziko / otevřený bod:** Vercel dává stejné proměnné prostředí buildu i běhu, takže URL vlastníka pro migrace zůstane dostupné i běžícímu kódu (jen pod jiným názvem). To nechrání před RCE, chrání to před SQL injection a únikem běžného URL. Úplné oddělení znamená spouštět migrace mimo Vercel (GitHub Actions s tajemstvím) — viz otázka 2.
* Ověření: testovací větev Neonu; zda role vytvořená přes SQL nedědí `BYPASSRLS` (role vytvořené přes konzoli Neonu mohou být v `neon_superuser`) — **ověřit před nasazením**.
* Odhad: 1–2 dny. Žádná změna kódu aplikace kromě konfigurace a testů.

### Krok B — RLS politiky, zatím nevynucované

* Migrace `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (bez `FORCE`) a politiky pro 33 + 4 + ~10 tabulek. Pro vlastníka (dnešní spojení) se nic nemění, takže to nelze rozbít.
* Tvar politiky: `USING (household_id = (select nullif(current_setting('app.household_id', true), '')::uuid))`; `select` kolem `current_setting` se vyhodnotí jednou na dotaz, ne na řádek. Potomci bez `household_id` přes `EXISTS` na rodiče, nebo (rychlejší, ale s migrací dat) doplněný sloupec.
* Globální tabulky: `SELECT` pro všechny, zápis jen to, co aplikace dnes skutečně dělá (návrhy kategorií, ceny z účtenek). RLS tam kromě oddělení čtení/zápisu mnoho nepřidá a nesnažíme se ho přehnat.
* Test úplnosti v CI: každá tabulka s `household_id` musí mít zapnuté RLS a politiku (nová tabulka bez politiky shodí test). Test křížového přístupu: pod rolí `app_runtime` se kontextem domácnosti A nesmí dát číst, měnit, mazat ani vložit řádek domácnosti B, v každé tabulce.
* Odhad: 3–4 dny (hlavně inventura tabulek a testy).

### Krok C — kontext domácnosti na každém dotazu a vynucení

Tohle je jádro a hlavní riziko.

* **Problém:** HTTP ovladač je bezstavový. `set_config('app.household_id', …, true)` platí jen uvnitř transakce, takže ho nelze nastavit jednou na začátku požadavku.
* **Navržené řešení bez zásahu do volání:** obalit klienta v `lib/db/client.ts` tak, aby každý dotaz šel jako `sql.transaction([select set_config('app.household_id', $1, true), …dotaz])` — jeden požadavek, atomicky, bez další latence. Kontext (`userId`, `householdId`) se bere z `AsyncLocalStorage`, který naplní `requireHousehold()`. Lokální `pg` ovladač dostane totéž přes `BEGIN; set_config; dotaz; COMMIT`.
* **Riziko:** Drizzle volá klienta přes vnitřní rozhraní (`client(query, params, opts)` a `client.transaction`); obal na něm závisí na verzi Drizzle. Proto **krok C0: ověřovací prototyp** (jeden dotaz + `db.batch` + relační `db.query.*` s `with`), než se cokoli plánuje dál. Pokud prototyp neobstojí, záložní cesta je přechod na Neon WebSocket `Pool` s opravdovými transakcemi (větší zásah, jiná latence).
* **Cesty bez domácnosti** (viz oddíl 2) dostanou druhé, **výslovně pojmenované** spojení `getSystemDb()` pod rolí s `BYPASSRLS` (nebo vlastníkem) a používá se jen v cron routách, obrazovkách správce, přijetí pozvánky a smazání účtu. Je to záměrná, malá a dohledatelná množina; test hlídá, že `getSystemDb` nevolá nic mimo povolený seznam souborů.
* **Rozhodnutí „která domácnost“:** `household_members` má politiku `user_id = app.user_id`, takže se po přihlášení nejdřív nastaví jen uživatel, z člena se zjistí domácnost a pak se nastaví i ona.
* **Nasazení:** za přepínačem (proměnná `RLS_ENFORCE`). Nejdřív kontext jen nastavovat (role je stále vlastník, nic se nevynucuje), pak přepnout `DATABASE_URL` na `app_runtime` a sledovat chyby; vrácení = přepnout URL zpět. Každý dotaz odmítnutý politikou se objeví jako chyba, proto před přepnutím projít provoz proti testovací větvi (Playwright smoke už existuje).
* Odhad: 5–8 dní včetně prototypu, a to jen když prototyp C0 vyjde.

## 4. Co tím **nezískáme** (aby nebyla falešná jistota)

* RLS nechrání před chybou, kdy aplikace nastaví **špatnou** domácnost do kontextu, ani před kompromitací samotné aplikace (RCE).
* Globální katalog (`products`, `prices`, `deals`) zůstává zapisovatelný celou aplikací; ochrana je governance (limity návrhů), ne RLS.
* Neon Auth (účty) leží mimo naši kontrolu; role jen zajistí, že k nim aplikace nesahá.

## 5. Doporučení

1. **Udělat krok A hned** — velký přínos (uniklé URL, SQL injection), malé riziko, žádná změna kódu.
2. **Udělat prototyp C0** (několik hodin) a podle něj rozhodnout, zda B a C jsou za své. Pokud prototyp neobstojí nebo latence vzroste, zastavit po kroku A; zbytek by přinesl málo za velké riziko regrese.
3. Krok B bez C má smysl jen jako příprava, takže ho nezačínat před výsledkem C0.

## 6. Otázky k rozhodnutí

1. Jdeme krokem A (role bez RLS) jako samostatným PR hned? *(doporučuji ano)*
2. Mají migrace zůstat v `pnpm build` na Vercelu (jednodušší, URL vlastníka zůstane v prostředí), nebo je přesunout do GitHub Actions (čistší oddělení, ale změna nasazovacího postupu a ztráta „migrace jdou samy s nasazením“)?
3. Prototyp C0 smím dělat na testovací větvi Neonu (`pnpm db:migrate:test`)?
4. Má u kroku C `getSystemDb()` (cron, správce, pozvánky) používat samostatnou roli s `BYPASSRLS`, nebo vlastníka?
