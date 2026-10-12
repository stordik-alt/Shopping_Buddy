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
| V1 | Změna kategorie produktu přepisuje výdaje cizích domácností | **Otevřeno** | `lib/db/purchase-items.ts:~266` volá `syncProductClassificationToPurchases` bez scopu domácnosti |
| V2 | Kterýkoli člen smaže vlastníka | **Opraveno v kódu 2026-10-12** (`canRemoveMember`) | `app/actions/household.ts:136` bez kontroly role a „posledního vlastníka“ |
| V3 | Chybí FK `household_members.user_id` → `neon_auth."user"` | **Otevřeno** (migrace bez FK; jediný odkaz je v `0041`). Nutno ověřit živé schéma | `lib/db/migrations` |
| V4 | Zranitelné závislosti | **Opraveno** | `sharp` 0.35.5, `shadcn` v devDependencies; `pnpm audit --prod` = 3 moderate (zbytek přes `@neondatabase/auth`: `esbuild`, `baseline-browser-mapping`, `fast-uri`) |
| V5 | `npx vercel@latest` s produkčním tokenem | **Opraveno v kódu 2026-10-12** (připnuté CLI z lockfile, jen ruční spuštění z `main`) | `.github/workflows/vercel-deploy.yml:30` |
| V6 | Únik SQL parametrů/podpisů do logů a odpovědí | **Otevřeno** | `lib/receipt-log.ts` nemaskuje `params:` |
| V7 | `retryReceiptImportAction` bez stropu (placené OCR/LLM) | **Otevřeno** | žádný čítač pokusů |
| V8 | Registrace/přihlášení bez CAPTCHA a rate limitu | **Otevřeno** | v `app`/`components` žádná CAPTCHA |
| S6 | Chybí kontrola role u `updateHouseholdAction`, `updateHouseholdPreferencesAction`, `addHouseholdMemberAction`, `removeChildAction` | **Otevřeno** (je třeba rozhodnout záměr, viz fáze 2) | `app/actions/household.ts` |
| S13 | `minimumReleaseAge` není nastaveno | **Otevřeno** | `pnpm-workspace.yaml` |
| S14 | `poweredByHeader`, COOP/CORP, `Content-Disposition` u PDF | **Otevřeno** | `next.config.mjs` |

Ostatní S/L položky z auditu 35 nebyly znovu rozebírány a platí tak, jak jsou popsány tam.

## 3. Nové / upřesněné poznatky

* **N1 — `checkInviteRateLimit` je jen paměť procesu** (`lib/rate-limit.ts`, `Map`). Na Vercelu každá instance funkce počítá zvlášť a po studeném startu se čítač vynuluje, takže limit 5/min je prakticky nevynutitelný. Dopad je malý (zvát smí jen vlastník), ale ochrana je zdánlivá. Řešit spolu s V7/V8 jedním databázovým čítačem.
* **N2 — Pozvánka vs. K2:** kromě auto-joinu v `getHouseholdData` kontroluje i `acceptInvitationAction` jen shodu e-mailu. Oprava K2 musí pokrýt obě cesty (token + ověřený e-mail).
* **N3 — V2 a osiřelé účty:** po smazání člena (řádek `household_members`) přihlášený uživatel při dalším načtení dostane novou prázdnou domácnost (`createHouseholdForUser`), takže odebraný člen přichází o přístup, ale vlastník domácnosti nikoli o data; naopak odebraný **vlastník** domácnost ztrácí natrvalo (unikátní `user_id`). Potvrzuje závažnost V2.

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
11. CHECK constraints na peníze/měny/množství (oddíl 4 auditu 35), šifrované zálohy, smazání účtu a retence PII, RLS s oddělenou aplikační rolí (S1–S5, S18). Největší práce, nejvyšší hodnota do hloubky; plánovat jako samostatné epiky.
12. Zbylé S/L položky z auditu 35 podle priority.
13. Zbývající 3 moderate závislosti sledovat; řeší se aktualizací `@neondatabase/auth`, ne vlastním zásahem.

## 5. Co z repozitáře nelze ověřit (nutná ruční kontrola)

1. Konfigurace Neon Auth: ověření e-mailu, rate limit, CAPTCHA, politika hesel (rozhoduje o skutečné závažnosti K2 a V8).
2. Živé produkční schéma `household_members` (V3) a role, pod kterou aplikace do DB přistupuje.
3. Skutečné produkční hlavičky po nasazení CSP (K1) a chování Cloudflare buildu (HSTS).
