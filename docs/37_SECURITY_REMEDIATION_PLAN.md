# Bezpečnost: kontrolní audit a plán oprav

**Datum:** 2026-10-12
**Navazuje na:** `docs/35_SECURITY_AUDIT.md` (2026-10-06, zůstává jako historický detailní rozbor)
**Metoda:** znovu ověřen stav každého nálezu proti aktuálnímu kódu větve `feat/profile-tabs-guide`, `pnpm audit --prod`, ruční průchod autorizace serverových akcí, API rout, cronů, pushe, uploadu účtenek a správy členů. Nic v kódu aplikace nebylo měněno.

## 1. Souhrn

Základ je zdravý a potvrdil se znovu: všechny serverové akce a API routy určují domácnost ze session, mutace podle ID jsou scopované domácností (včetně `pantry`, `shopping`, `purchases`, `notifications`, `push`), cron selhává zavřeně s `timingSafeEqual`, upload účtenky se typuje podle bajtů a má limit, push endpoint je na allowlistu (bez SSRF), v gitu nejsou žádná tajemství (jen CI placeholdery), raw SQL je parametrizované, žádný XSS sink.

Za 6 dní od prvního auditu byl opraven **jediný** nález (V4 závislosti). Obě kritické položky a většina vysokých **zůstává otevřená**.

## 2. Stav nálezů z auditu 35

| ID | Nález | Stav | Důkaz |
|---|---|---|---|
| K1 | Žádná Content-Security-Policy | **Opraveno v kódu 2026-10-12**: politika s nonce se posílá v režimu Report-Only; **vynucování zapne `CSP_ENFORCE=1` ve Vercelu** | `proxy.ts` a `next.config.mjs` neobsahují `Content-Security-Policy`; komentář v `next.config.mjs:5,33` stále tvrdí opak |
| K2 | Auto-join do cizí domácnosti jen podle e-mailu, bez tokenu a bez ověření e-mailu | **Opraveno v kódu 2026-10-12** (auto-join jen s `emailVerified`; zbývá zapnout ověření e-mailu v Neon Auth) | `lib/db/queries.ts` (`getHouseholdData`) nezná `emailVerified`; `acceptInvitationAction` také jen porovná řetězec |
| V1 | Změna kategorie produktu přepisuje výdaje cizích domácností | **Opraveno v kódu 2026-10-12** (varianta „jen vlastní domácnost“) | `lib/db/purchase-items.ts:~266` volá `syncProductClassificationToPurchases` bez scopu domácnosti |
| V2 | Kterýkoli člen smaže vlastníka | **Opraveno v kódu 2026-10-12** (`canRemoveMember`) | `app/actions/household.ts:136` bez kontroly role a „posledního vlastníka“ |
| V3 | Chybí FK `household_members.user_id` → `neon_auth."user"` | **Opraveno v kódu 2026-10-12** (migrace `0103`; na Neon větvi z produkce klíč už byl, chyběl na databázích z migrací) (migrace bez FK; jediný odkaz je v `0041`). Nutno ověřit živé schéma | `lib/db/migrations` |
| V4 | Zranitelné závislosti | **Opraveno** | `sharp` 0.35.5, `shadcn` v devDependencies; `pnpm audit --prod` = 3 moderate (zbytek přes `@neondatabase/auth`: `esbuild`, `baseline-browser-mapping`, `fast-uri`) |
| V5 | `npx vercel@latest` s produkčním tokenem | **Opraveno v kódu 2026-10-12** (připnuté CLI z lockfile, jen ruční spuštění z `main`) | `.github/workflows/vercel-deploy.yml:30` |
| V6 | Únik SQL parametrů/podpisů do logů a odpovědí | **Opraveno v kódu 2026-10-12** (`lib/redact.ts`, `safeErrorMessage`) | `lib/receipt-log.ts` nemaskuje `params:` |
| V7 | `retryReceiptImportAction` bez stropu (placené OCR/LLM) | **Opraveno dřív** (`reserveReceiptOcrAttempt` počítá i opakování); 2026-10-12 přidán navíc strop pro celou aplikaci | žádný čítač pokusů |
| V8 | Registrace/přihlášení bez CAPTCHA a rate limitu | **Částečně opraveno 2026-10-12** (limit na adresu v DB, globální strop OCR); **zbývá CAPTCHA** a nastavení Neon Auth | v `app`/`components` žádná CAPTCHA |
| S6 | Chybí kontrola role u akcí nastavení domácnosti | **Opraveno v kódu 2026-10-13** (rozsah podle rozhodnutí vlastníka: nastavení domácnosti a uzávěrka období jen správce; preference, děti a profily i peníze zůstávají všem členům) | `app/actions/household.ts` |
| S2 | Chybí smazání účtu a domácnosti; neomezená retence PII | **Opraveno v kódu 2026-10-13**: smazání účtu a týdenní retence (OCR text 90 dní, pozvánky 30 dní po vypršení); zbývá ověřit `delete-user` v Neon Auth | `app/actions/account.ts`, `lib/db/account-deletion.ts` |
| S3 | Nešifrovaný `pg_dump` celé DB do `backups/` | **Opraveno v kódu 2026-10-13** (zbývá vygenerovat `BACKUP_ENCRYPTION_KEY` a vyzkoušet obnovu) | `scripts/backup-db.ts`, `lib/backup-crypto.ts` |
| S13 | `minimumReleaseAge` není nastaveno | **Opraveno 2026-10-13** | `pnpm-workspace.yaml` |
| S14 | `poweredByHeader`, COOP/CORP, `Content-Disposition` u PDF | **Opraveno 2026-10-13** (COOP záměrně ne) | `next.config.mjs` |

Ostatní S/L položky z auditu 35 nebyly znovu rozebírány a platí tak, jak jsou popsány tam.

## 3. Nové / upřesněné poznatky

* **N1 (opraveno 2026-10-12, limit pozvánek je teď v databázi) — `checkInviteRateLimit` byl jen paměť procesu** (`lib/rate-limit.ts`, `Map`). Na Vercelu každá instance funkce počítá zvlášť a po studeném startu se čítač vynuluje, takže limit 5/min je prakticky nevynutitelný. Dopad je malý (zvát smí jen vlastník), ale ochrana je zdánlivá. Řešit spolu s V7/V8 jedním databázovým čítačem.
* **N2 — Pozvánka vs. K2:** kromě auto-joinu v `getHouseholdData` kontroluje i `acceptInvitationAction` jen shodu e-mailu. Oprava K2 musí pokrýt obě cesty (token + ověřený e-mail).
* **N3 — V2 a osiřelé účty:** po smazání člena (řádek `household_members`) přihlášený uživatel při dalším načtení dostane novou prázdnou domácnost (`createHouseholdForUser`), takže odebraný člen přichází o přístup, ale vlastník domácnosti nikoli o data; naopak odebraný **vlastník** domácnost ztrácí natrvalo (unikátní `user_id`). Potvrzuje závažnost V2.

* **N4 (opraveno 2026-10-13, přeřazení z rozpočtu teď jde přes `proposeProductCategory`/`proposeProductSubcategory`) — Přeřazení z rozpočtu obchází schvalování katalogu:** `setPurchaseItemExpenseSplits` mění sdílený `products` přímo (kontroluje jen `categoryLocked`), bez počítání volných změn a bez schvalování správcem, které používají `proposeProductCategory` a `proposeProductSubcategory`. Kterákoli domácnost tak může opakovaně přeřadit produkt pro všechny budoucí účtenky. V1 omezila jen přepis cizí historie; tohle zůstává otevřené a vyžaduje rozhodnutí (vést tuto cestu přes stejné návrhy).

## 4. Plán oprav

Každá fáze je samostatná, malá PR. Pořadí je dané závažností a nízkým rizikem regrese. U každé opravy platí z `CLAUDE.md`: test, aktualizace příslušného dokumentu a záznam v `docs/07_CHANGELOG.md` až po dokončení.

### Fáze 1 — kritické a rychlé (cca 1 den)

1. **K2** — `getHouseholdData`: auto-join provést jen když `session.user.emailVerified === true`; jinak vytvořit vlastní domácnost a pozvánku nechat na tokenu (`acceptInvitationAction` se stejnou podmínkou). Uživatelsky viditelné: pozvaný s neověřeným e-mailem musí použít odkaz s tokenem. Současně v Neon Auth zapnout vynucené ověření e-mailu (konfigurace mimo repo, zapsat do `docs/00_CURRENT_SOURCE_OF_TRUTH.md`). Test: neověřený účet se shodným e-mailem se nepřipojí.
2. **V2** — `removeHouseholdMemberAction`: povolit jen vlastníkovi (nebo odebrání sebe sama), zakázat odebrání posledního vlastníka, v UI skrýt tlačítko ostatním (`components/household/household-profile.tsx`). Test: člen nesmaže vlastníka; vlastník nesmaže sám sebe jako posledního.
3. **K1** — v `proxy.ts` generovat nonce a nastavit `Content-Security-Policy` podle `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`; nejdřív `Content-Security-Policy-Report-Only`, po ověření v prohlížeči (Vercel Analytics, service worker, R2/OCR obrázky) přepnout na vynucování. Opravit komentáře v `next.config.mjs` a tři dokumenty z auditu 35 (oddíl K1).
4. **V5** — `vercel` připnout do `devDependencies`, workflow volat `pnpm exec vercel`; odstranit mrtvou větev s `workflow_run`.

### Fáze 2 — autorizace, náklady a úniky (1–2 dny)

5. **V1** — omezit `syncProductClassificationToPurchases` na volající domácnost, nebo globální změnu vést stávajícím schvalovacím tokem (`product_category_changes`); zaznamenat původce. Nejdřív rozhodnutí vlastníka produktu, které z toho je záměr (sdílený katalog je záměrný, přepis cizích výdajů nejspíš ne).
6. **V7 + V8 + N1** — jeden databázový čítač pokusů (`receipt_imports.process_attempts`, strop v `claimReceiptImport`; pozvánky a auth přes tabulku čítačů místo `Map`); cache výstupu OCR při opakování. CAPTCHA (Turnstile) na registraci a zapnutí rate limitu v Neon Auth.
7. **V6** — `redactSecrets` rozšířit o `params:`, `X-Amz-*`, `signature`, `token`, `scheme://user:pass@`; `safeDbErrorMessage()` v `lib/errors.ts` použít v cron routách (`import-stores`, `albert-store-formats`) a v logu `receipt_upload_failed`.
8. **S6** — rozhodnout, které akce jsou jen pro vlastníka (název domácnosti, rozpočet, přidání/odebrání členů a dětí) a sjednotit kontrolu role v jednom helperu (`requireOwner()` v `lib/auth/authorize.ts`).
9. **V3** — nejdřív ověřit živé schéma (`\d household_members`); podle výsledku migrace s FK `ON DELETE SET NULL` (po kontrole osiřelých řádků), přidat do CI kontrolu driftu. Migrace musí být aditivní (viz `CLAUDE.md` §7).

### Fáze 3 — zpevnění (průběžně)

10. **S13/S14** — `minimumReleaseAge` v `pnpm-workspace.yaml`, `poweredByHeader: false`, `Content-Disposition` a COOP/CORP u souborů účtenek, `Cache-Control` beze změny.
11. CHECK constraints na peníze/množství/věk (oddíl 4 auditu 35; **hotovo 2026-10-13, migrace `0104`**; kód měny ve dvou krocích: **krok 1 (normalizace v kódu + oprava dat) 2026-10-13, migrace `0105`**; krok 2 (CHECK na tři velká písmena, migrace `0106`) připraven v samostatném PR, smí se nasadit až po kroku 1), šifrované zálohy (**hotovo 2026-10-13**), smazání účtu a retence PII (**hotovo 2026-10-13**), RLS s oddělenou aplikační rolí (S1–S5, S18). Největší práce, nejvyšší hodnota do hloubky; plánovat jako samostatné epiky.
12. Zbylé S/L položky z auditu 35 podle priority.
13. Zbývající 3 moderate závislosti sledovat; řeší se aktualizací `@neondatabase/auth`, ne vlastním zásahem.

## 5. Co z repozitáře nelze ověřit (nutná ruční kontrola)

1. Konfigurace Neon Auth: ověření e-mailu, rate limit, CAPTCHA, politika hesel (rozhoduje o skutečné závažnosti K2 a V8).
2. Živé produkční schéma `household_members` (V3) a role, pod kterou aplikace do DB přistupuje.
3. Skutečné produkční hlavičky po nasazení CSP (K1) a chování Cloudflare buildu (HSTS).
