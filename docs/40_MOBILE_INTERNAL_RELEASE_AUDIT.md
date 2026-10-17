# Audit připravenosti ANITKA na interní mobilní vydání

**Datum auditu:** 2026-10-17  
**Auditovaný checkout:** `e7f2e9bb3828e3cd39b4ac5bff81c54c3946e245`  
**Rozsah:** produkční PWA `mojeanitka.cz`, webový a Cloudflare build, Expo aplikace a její API, autentizace, klíčové obrazovky, kamera/OCR, oprávnění, offline režim, synchronizace, testy a CI.  
**Bezpečnostní hranice:** audit nic nenasazoval, neměnil produkční konfiguraci a nepřistupoval k produkční databázi.

## 1. Splněná kritéria

### Ověřeno přímo na aktuálním checkoutu

- `corepack pnpm install --frozen-lockfile` — úspěch.
- CI výběr unit testů — **197 souborů, 3 605 testů prošlo**. Obsahuje testy mobilního API klienta, token cache, offline fronty a offline úložiště. Tento příkaz záměrně vynechává `app/api/**` a databázové testy.
- Webový TypeScript: `corepack pnpm exec tsc --noEmit` — úspěch.
- Expo TypeScript: `corepack pnpm --filter @shopping-buddy/mobile typecheck` — úspěch.
- Webový produkční build: `corepack pnpm build` — úspěch. Build použil pouze neprodukční zástupné hodnoty; migrační guard potvrdil, že migrace neběžely.
- Cloudflare/OpenNext build: `pnpm cf:build` — úspěch po zpřístupnění standardního pnpm shim procesu. Migrace byly přeskočeny. Build vypsal upozornění OpenNext, že podpora Node.js middleware na Cloudflare je experimentální; build samotný prošel.
- Expo Android export: `pnpm --filter @shopping-buddy/mobile export` — úspěch, Metro vytvořilo Android JavaScript bundle z 1 548 modulů. Jde o bundle export, **ne** o instalovatelný APK/AAB.
- `expo install --check` skončil úspěšně a oznámil aktuální závislosti, ale v tomto sandboxu neměl přístup k síti a použil lokální mapu SDK; jeho lokální výsledek proto není spolehlivým vzdáleným ověřením kompatibility.
- Kód PWA obsahuje ANITKA standalone manifest a service worker (`app/manifest.ts`, `public/sw.js`). Worker používá síť jako první a při výpadku může zobrazit poslední uloženou stránku aplikace; samostatná fronta nákupního seznamu uchovává změny na zařízení.
- Expo implementuje nákupní seznam, rozpočet, zásoby, recepty, plán jídel, čárový kód a import účtenek. Mobilní API odvozuje uživatele a domácnost serverově. Nativní token je ukládán přes Expo SecureStore; kamera se zapíná až po akci uživatele a konfigurace vypíná mikrofon/záznam zvuku.
- V aktuálním lokálním unit runu testy pokrývají retry při síťové chybě, API odpovědi 401/500, stabilní ID offline přidané položky, frontu změn a izolaci lokálního snapshotu podle uživatele/domácnosti. Testy mobilních Route Handlerů jsou v `app/api/**`, které tento unit run vynechává.

### Ověřeno v nedávných GitHub Actions

Nejnovější dokončené workflow z 2026-10-17 běžely na SHA `881907c5c30d28dd5e1b8955084c4dfebecc3d9f`, nikoli na aktuálním checkoutu auditu (`e7f2e9bb3828e3cd39b4ac5bff81c54c3946e245`); jsou tedy podpůrným důkazem, ne náhradou lokálních kontrol aktuálního checkoutu:

- [CI run 39038229949](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/39038229949) — úspěšné unit testy, webový typecheck/build, Cloudflare Worker build, databázové testy na izolovaném PostgreSQL a Playwright.
- [Mobile CI run 39038229915](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/39038229915) — úspěšný Expo typecheck, kontrola Expo závislostí a Android bundle export.
- [Security audit run 39038229941](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/39038229941) — úspěšný CodeQL a audit produkčních závislostí.

Databázový/API job v CI spustil `app/api/**` na izolovaném PostgreSQL, včetně mobilních Route Handler testů pro autorizaci, chybové stavy a souběžné zpracování účtenky. Playwright v CI pokrývá **webovou PWA**, včetně registrace, dosažení obrazovky ověření e-mailu, následného přihlášení a základní navigace; samostatný test pokrývá rozpočet. Testy však nastavují `emailVerified` přímo v izolované databázi, protože CI nemá mailbox. Skutečné doručení a přijetí OTP proto ověřeny nejsou. Tyto E2E testy nejsou testy nativní Expo aplikace.

## 2. Selhávající testy

- Z dokončených testů a buildů na aktuálním checkoutu **neprošel žádný**.
- První pokus o Cloudflare build skončil chybou prostředí (`pnpm: not found` v podprocesu OpenNext); po aktivaci standardního Corepack pnpm shimu opakovaný build prošel. Nešlo o selhání aplikačního kódu.
- Lokální `expo install --check` nemohl ověřit verze proti síti; výsledek je označen jako omezený, nikoli jako plnohodnotný test.
- V `package.json` není lint skript, proto lint nebyl k dispozici.

## 3. Známé nedostatky a neověřené oblasti

- **Živá produkční PWA nebyla ověřena.** `curl` v sandboxu skončil chybou DNS „Could not resolve host: mojeanitka.cz“; prohlížečový nástroj navíc nebyl v této relaci autorizován. To nedokazuje výpadek webu, pouze znemožňuje potvrdit jeho dostupnost, manifest, přihlášení a chování service workeru v produkci.
- **Nativní Expo aplikace nemá registraci ani obrazovku ověření e-mailu**; nabízí přihlášení. Nový uživatel potřebuje existující účet s ověřenou adresou, například vytvořený přes PWA. API neověřený účet odmítá.
- Skutečný Neon Auth OTP, obnovení přihlášení/tokenů, produkční issuer/JWKS, R2 upload, OCR poskytovatelé a Open Food Facts nebyly z tohoto sandboxu živě volány.
- Nebyl k dispozici Android/iOS telefon ani emulátor. Oprávnění kamery, skenování, fotografování účtenky, zobrazení receptového obrázku, instalace aplikace, restart po přihlášení a fyzické chování UI nebyly na zařízení otestovány.
- Expo export nevytváří podepsaný instalační balíček; žádný EAS/Gradle/Xcode instalační build nebyl spuštěn a iOS build se neprováděl.
- Nativní offline režim je omezen na nákupní seznam. Rozpočet, zásoby, recepty, jídelníček, čárové kódy a účtenky vyžadují připojení. U PWA se offline stránka opírá o poslední úspěšně načtenou hlavní stránku; kompletní offline provoz všech sekcí není doložen.
- Testy výpadku sítě a chyby API jsou jednotkové simulace/moky. Nebyl proveden přechod skutečného zařízení do režimu letadlo, obnovení připojení ani živé opakování požadavku.
- Stabilní klientské ID podporuje idempotentní přehrání přidání položky; OCR používá atomický claim a souběžný požadavek může být odmítnut jako již zpracovávaný. Skutečné dvojité odeslání přes mobilní síť a jeho výsledek v produkční databázi nebyly otestovány.
- Čárový kód se neukládá do katalogu. Neznámý kód vyžaduje ruční zadání.
- Historický odstavec v `docs/01_CURRENT_STATE.md` stále uváděl, že PWA nemá service worker; tento audit jej opravuje aktuálním stavem implementace.

## 4. Blokující problémy

1. Bez dostupného ověření `mojeanitka.cz` nelze potvrdit, že produkční PWA a její autentizační konfigurace fungují.
2. Pro vydání nativní aplikace chybí ověřený instalační balíček a test na fyzickém Android/iOS zařízení, zejména kamera, oprávnění, přihlášení a offline fronta.
3. E-mailové OTP a skutečné produkční přihlášení nebyly ověřeny. CI nahrazuje potvrzení adresy změnou řádku v izolované databázi.
4. Chování při skutečném výpadku sítě, chybě API a opakovaném požadavku bylo ověřeno pouze na úrovni unit testů a zdrojového kódu, nikoli end-to-end.

## 5. Doporučení

**Nedoporučuji nyní deklarovat aplikaci jako připravenou k internímu vydání ani distribuovat nativní build.** Buildy a dostupné automatizované kontroly jsou zelené, ale chybí potvrzení produkčního webu, živého autentizačního toku a nativního chování na zařízení. Po uzavření blokujících bodů lze zvážit omezený interní pilot s předem ověřenými účty. Tento audit žádné vydání ani změnu produkce neprovedl.
