# Bezpečnostní analýza projektu Shopping Buddy

**Datum:** 2026-10-06
**Větev:** `feat/new-flyer-notifications` (HEAD `e1795d7`) — pracovní strom je **uprostřed nevyřešeného mergi** (viz oddíl 7)
**Rozsah:** celý repozitář — autorizace, API/routy, datová vrstva, klient, konfigurace, závislosti, CI/CD, dokumentace
**Metoda:** statická analýza zdrojů + `pnpm audit` + inspekce internals Next.js 16.3.8 + `git` (historie, tracked soubory). **Nic nebylo měněno v kódu aplikace.**

> Toto je audit pro fázi „security audit“ z `docs/04_ROADMAP.md` (Phase F). Není to zápis do changelogu (žádná změna ještě nebyla provedena).

---

## 1. Souhrn

Aplikace je **na poměrně vysoké úrovni** zabezpečení: autorizace domácnosti je důsledně serverová (ověřeno u všech 85 serverových akcí), žádná akce nepřebírá `householdId`/`userId`/`role` z klienta, cron selhává zavřeně (constant-time porovnání), uploady účtenek se validují podle bajtů a mají limit, v gitu nejsou žádná tajemství, v kódu není žádný XSS sink a scrapovaný obsah se nevykresluje jako HTML.

Přesto audita odhalila **dvě kritické a několik vysokých nálezů**, z nichž nejdůležitější je paradoxně věc, o které kód i dokumentace **tvrdí, že je nasazená, ale není**:

| # | Nález | Závažnost | Dosažitelnost |
|---|---|---|---|
| 1 | **Content-Security-Policy v produkci neexistuje** (`experimental.csp` je neplatný klíč) | Kritická | produkce `main` |
| 2 | **Auto-join do cizí domácnosti jen podle shody e-mailu, bez tokenu** (neověřený e-mail) | Kritická (podmíněná konfigurací Neon Auth) | každý přihlášený uživatel |
| 3 | **Běžná uživatelská akce přepisuje data cizích domácností** (rozpočtové řádky) | Vysoká | každý člen domácnosti |
| 4 | **Člen může odebrat vlastníka domácnosti** (trvalý lockout) | Vysoká | každý člen domácnosti |
| 5 | **Chybí FK `household_members.user_id → neon_auth.user`** (kód i komentáře tvrdí opak) | Vysoká | nové branche / obnovené dumpy |
| 6 | **Zranitelné závislosti** (`sharp`, `undici`, + kritické přes nepoužívané `shadcn` v `dependencies`) | Vysoká | nahrávání účtenek |
| 7 | **`npx vercel@latest` s produkčním tokenem** v deploy workflow (jediná cesta k produkci) | Vysoká | supply chain |
| 8 | **Únik SQL parametrů do logů a odpovědí** (Drizzle chyby, neredigované) | Střední/vysoká | cron / logy |
| 9 | **`retryReceiptImportAction` bez stropu opakuje placená OCR/LLM volání** | Vysoká | každý člen domácnosti |
| 10 | **Registrace/přihlášení bez CAPTCHA a rate limitu** (hromadné účty → placená volání) | Vysoká (podmíněná Neon Auth) | veřejná |
| 11 | **Chybí rate limiting na autentizaci**, žádné RLS, připojení jako `neondb_owner`, chybí mazání účtu (GDPR), nešifrovaný dump | Střední | systémové |

Prioritizovaný plán oprav je v oddílu 6.

---

## 2. Co je v pořádku (ověřeno, není potřeba opakovat)

Tyto kontroly dopadly dobře a slouží jako baseline:

1. **Autorizace všech 85 serverových akcí.** Každá akce v `app/actions/*.ts` volá `requireHousehold`/`requireHouseholdId`/`requireAdmin` (nebo `acceptInvitationAction` ověří session přímo). Žádná akce nečte ani nemění data domácnosti bez kontroly.
2. **Žádná akce nepřebírá `householdId`/`userId`/`memberId`/`role`/`isOwner` z klienta.** Vše se odvozuje ze session (`lib/auth/authorize.ts:12-19`).
3. **Mutace podle ID jsou vždy scopované domácností** — buď `and(eq(id), eq(householdId))`, nebo ověření vlastnictví před zápisem. „Neexistuje“ a „patří jiné domácnosti“ vrací stejnou odpověď (bez oraclů).
4. **Raw SQL je parametrizovaný.** Všechna volání `sql\`\`` v `lib/db/*` používají vázané parametry; `sql.raw` jen nad konstantami (generovaný sloupec `SEARCH_ACCENTED`); `LIKE` escape je správný.
5. **Cron selhává zavřeně** (`lib/cron-auth.ts:16-27`): bez `CRON_SECRET` → 503, porovnání `timingSafeEqual`. Všech 8 cron rout je chráněno (3 ingest-prices delegují na `handleIngestCron`, který kontrolu provádí).
6. **Upload účtenky:** typ souboru se určuje z bajtů (`lib/receipt-image.ts:20-30`), ne z klientského MIME; limit 10 MB; rate limit 30/24 h na domácnost (`lib/receipt-upload-limit.ts:6`); prázdný soubor odmítnut.
7. **Obrazy účtenek a receptů** se streamují přes route s autorizací na serveru a `Cache-Control: private, no-store` (`app/api/receipts/[id]/image/route.ts`, `app/api/recipes/images/[id]/route.ts`).
8. **Admin flow:** obě admin stránky kontrolují `isAppAdmin()` server-side s `notFound()` (`app/admin/ideas/page.tsx:14`, `app/admin/subcategories/page.tsx:15`); admin akce volají `requireAdmin()`; `app_admins` se zapisuje jen skriptem.
9. **Push:** endpoint se validuje proti allowlistu známých push služeb (ochrana před SSRF, `lib/push/subscription.ts:36-47`); odebrání je scopované na `memberId`.
10. **R2 storage:** privátní bucket, žádné veřejné URL, klíče kódované po segmentech, credentials server-only, chybové detaily zkrácené (`lib/storage/r2.ts`).
11. **Žádný XSS sink.** Grep `dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document.write|eval(|new Function(` → 0 zásahů. Scrapované recepty se **neukládají jako HTML** (pokyny/suroviny jen jako strukturovaná data), obrázky jdou do `<img src>` s `referrerPolicy="no-referrer"`.
12. **Žádná tajemství v klientském bundlu ani v gitu.** Jediná `NEXT_PUBLIC_*` je nesekretní `NEXT_PUBLIC_LOCAL_DATABASE`. `.env.local`, `.env*`, `backups/`, `gcp-oidc-private-key.pem`, `.dev.vars*` jsou gitignorované; `git log --all --diff-filter=A -- '*.env*' '*.pem'` → nic.
13. **Testy nemíří na produkci** (`test/setup-test-database.ts:44-52` přepíše URL a odmítne shodu s produkcí). **Migrační guard je fail-closed** (`lib/db/migrate-guard.ts:10-17`), CI `pnpm build` nemůže sáhnout na produkci.
14. **CI:** `permissions: contents: read`, žádné `pull_request_target`, e2e job vypnutý, `--frozen-lockfile`, `allowBuilds` je explicitní allow-list.
15. **Session fast-path je bezpečný** (`lib/auth/session-cookie.ts` + `lib/auth/server.ts:35`): bez session cookie se Neon Auth nevolá; middleware kontroluje jen přítomnost cookie, skutečná autorizace je serverová.
16. **Error pages neprozrazují detaily** (`app/error.tsx`, `app/global-error.tsx` zobrazují jen digest). Analytika neposílá PII.

---

## 3. Nálezy

### 3.1 KRITICKÉ

#### K1 — Content-Security-Policy v produkci neexistuje; kód i dokumentace tvrdí opak

`next.config.mjs:14-18` nastavuje:

```js
experimental: {
  csp: true,   // ← neplatný klíč
```

**Důkazy (nezávisle ověřeno):**

* Next.js 16.3.8 sám při startu hlásí: `.next/dev/logs/next-development.log` → `? csp (invalid experimental key)`.
* Schéma konfigurace `node_modules/next/dist/server/config-schema.js` (`experimentalSchema`) má **150 klíčů, ale `csp` ani `nonce` mezi nimi není** (`serverActions` a `proxyClientMaxBodySize` ano).
* `next.config.mjs:34-56` (`headers()`) obsahuje jen `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` — **CSP tam není**.
* `proxy.ts` CSP nenastavuje.
* **Ověřeno na živé produkci:** `node fetch https://s-anitkou.vercel.app/` → `content-security-policy: null` (přítomny jen `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy` a HSTS `max-age=63072000; includeSubDomains; preload` — HSTS tedy přidává sám Vercel). `/api/health` stejně.
* Je to na **`main`** (`git show origin/main:next.config.mjs` obsahuje `csp: true` a už neobsahuje `Content-Security-Policy`) — nejde o necommitnutou práci, ale o sloučený a nasazený stav.
* Jediné použití CSP v Nextu je **čtení** příchozí hlavičky `Content-Security-Policy` kvůli extrakci nonce (`node_modules/next/dist/server/render.js:407-408`, `app-render.js:209-210`). Nic CSP **negeneruje**.

Statická (byť s `unsafe-inline`) CSP existovala v `next.config.mjs` a byla odstraněna commitem `4d1f4a6` „Zahajuji opravu CSP: přechod na nonce-based…“, který je **na `main`** (i na `feat/new-flyer-notifications`). Aplikace tak přešla ze *slabé* politiky na **žádnou**.

**Proč je to kritické:** nejde o „chybí jedna hlavička“, ale o **chybějící obrannou vrstvu, o které kód, komentáře i tři dokumenty tvrdí, že existuje**. Kdo v budoucnu přidá jakýkoli renderovatelný cizí obsah (HTML letáku, markdown receptu, `dangerouslySetInnerHTML`), bude se spoléhat na ochranu, která není nasazená. Dnes to není zneužitelná zranitelnost (žádný sink neexistuje), ale jde o nejnebezpečnější třídu nálezu.

Dokumentace, která tvrdí opak (k opravě):

* `docs/01_CURRENT_STATE.md:204` — „…a **Content-Security-Policy** that allows only the app's own origin…“
* `docs/04_ROADMAP.md:48` — „Content-Security-Policy is in place…“
* `docs/06_KNOWN_ISSUES.md:18` — „CSP … still allows `'unsafe-inline'` scripts“

**Oprava:** (1) smazat `csp: true`; (2) generovat nonce v `proxy.ts` a nastavit `Content-Security-Policy` s `'nonce-{value}'` + nonce do `x-nonce` (přesně postup z `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`); (3) nasadit nejdřív jako `Report-Only`, ověřit, pak vynutit; (4) jako absolutní minimum vrátit statickou CSP (nejlépe stále bez `unsafe-inline`, s nonce). Současně opravit tři výše uvedené dokumenty.

#### K2 — Účet s neověřeným e-mailem se sám připojí do cizí domácnosti (bez tokenu)

`lib/db/queries.ts:491-498`:

```ts
const pendingInvitation = await db.query.invitations.findFirst({
  where: and(eq(schema.invitations.email, userEmail.toLowerCase()), eq(schema.invitations.status, 'pending')),
  orderBy: desc(schema.invitations.createdAt),
})
household =
  pendingInvitation && new Date(pendingInvitation.expiresAt) > new Date()
    ? await joinHouseholdViaInvitation(userId, userName, pendingInvitation)
    : await createHouseholdForUser(userId, userName)
```

`getHouseholdData()` se volá z `app/page.tsx:31` s `session.user.email`. Při prvním přihlášení bez členství se join rozhodne **výhradně podle shody e-mailového řetězce** — token pozvánky se vůbec nepoužije.

Že e-mail **není ověřený**, potvrzují tři nezávislé věci:

* `app/auth/sign-up/page.tsx:35-41` — po `signUp.email(...)` rovnou `router.push(...)`, žádný krok „potvrďte e-mail“.
* `lib/db/schema.ts:112` — „Token-based join link rather than emailed automatically — **no email-sending integration is provisioned yet**“.
* Grep `emailVerification|requireEmailVerification|verifyEmail|email_verified` → **0 výskytů**; typ `AppAuth` pole `emailVerified` nezná.

**Důsledek:** útočník, který zná (nebo uhodne) e-mail pozvaného, si na něj založí účet a pouhým otevřením `/` se stane členem cizí domácnosti — získá čtení i zápis seznamů, rozpočtu, výdajů, historie, zásob a účtenek. **Token pozvánky není potřeba.**

**Podmíněnost:** vyžaduje, aby pro daný e-mail existovala pending pozvánka, a aby Neon Auth neověřoval e-mail. Konfiguraci Neon Auth **z repozitáře nelze ověřit** — proto je nález kritický s podmínkou. I pokud Neon Auth ověřování zapíná, kód by neměl spoléhat na externí konfiguraci.

**Oprava:** (1) v Neon Auth zapnout vynucené ověření e-mailu; (2) v `getHouseholdData` podmínit auto-join ověřeným e-mailem (`session.user.emailVerified`) nebo — bezpečněji — auto-join úplně zrušit a nechat join jen přes `acceptInvitationAction` s tokenem (`app/actions/household.ts:153-171`).

---

### 3.2 VYSOKÉ

#### V1 — Běžná uživatelská akce přepisuje data cizích domácností

Spouštěč je úplně běžný: člen přiřadí položce nákupu jednu kategorii výdaje → `app/actions/purchases.ts` → `setPurchaseItemExpenseSplits` (`lib/db/purchase-items.ts:217`). Ta po validaci vlastnictví položky (:231) dospěje k:

`lib/db/purchase-items.ts:265-269`:

```ts
if (categoryRow && product && !product.categoryLocked && (product.categoryId !== categoryRow.id || product.subcategoryId !== (targetSubcategory?.id ?? null))) {
  await db.update(schema.products).set({ categoryId: categoryRow.id, subcategoryId: targetSubcategory?.id ?? null }).where(eq(schema.products.id, item.productId))
  await syncProductClassificationToPurchases(item.productId)
  return
}
```

A `syncProductClassificationToPurchases(productId)` (`lib/db/purchase-items.ts:29-75`) pak **bez ohledu na domácnost**:

* přepíše `category`/`subcategoryId` u **všech** `purchase_items` daného produktu (ř. 55),
* smaže jejich `purchase_item_expense_splits` (ř. 57),
* smaže `household_product_expense_defaults` ostatních domácností (ř. 62-72),
* přepočítá `expenses` (rozpočtové řádky) **všech dotčených nákupů** všech domácností (ř. 74).

Sdílený katalog produktů je záměrný, ale tento vedlejší efekt — **přepis historických rozpočtových řádků jiných domácností** — záměrně nevypadá. Není za ním admin gate, žádný limit ani záznam o původci.

**Oprava:** oddělit „změna sdíleného katalogu“ od zápisu. Buď (a) globální změnu kategorie vést stávajícím schvalovacím tokem (`product_category_changes` / `product_subcategory_changes`), nebo (b) omezit `syncProductClassificationToPurchases` na `products` + vlastní domácnost volajícího. Zaznamenat `changed_by`.

#### V2 — Každý člen může odebrat vlastníka domácnosti (trvalý lockout)

`app/actions/household.ts:64-70`:

```ts
export async function removeHouseholdMemberAction(memberId: string) {
  const householdId = await requireHouseholdId()   // ← role se nevyhodnocuje
  ...
  await db.delete(schema.householdMembers).where(eq(schema.householdMembers.id, memberId))
}
```

Na rozdíl od `inviteMemberAction` (:124) a `revokeInvitationAction` (:143) tu chybí `role !== 'owner'` a chybí ochrana „poslední vlastník“. UI to neblokuje: `components/household/household-profile.tsx:201` vykresluje `onRemove` u každého člena (pozvánky jsou `isOwner`-gated na :263 a :308).

**Důsledek:** běžný člen smaže vlastníka. Domácnost zůstane bez vlastníka → nikdo nemůže zvát ani rušit pozvánky. Odebraný vlastník se nemůže vrátit (`household_members_user_id_unique`, `lib/db/schema.ts:105` dovolí jen jedno členství na účet, a `getHouseholdData` mu nové nepřidělí). **Trvalý lockout dat domácnosti.**

**Oprava:** `requireHousehold()` → `role === 'owner'` (nebo „owner nebo sám sebe“), odmítnout odebrání posledního vlastníka, a opravit UI gating.

#### V3 — Chybí FK `household_members.user_id → neon_auth."user"(id)`

`lib/db/schema.ts:88`:

```ts
// References neon_auth.user(id); no Drizzle-level FK because that schema is managed by Neon Auth.
userId: uuid('user_id'),
```

Komentář tvrdí, že odkaz na účet existuje. V aktuální sadě migrací je ale jediný odkaz na `neon_auth` v `0041_app_admins.sql`; `household_members` v `0000_baseline_snapshot.sql` vzniká **bez** FK a žádná pozdější migrace ho nepřidává. Historická ruční migrace `0001_neon_auth_integration.sql` (zmiňovaná v `docs/07_CHANGELOG.md:1764`) v repu už neexistuje — číslování `0001` převzaly indexy.

**Dopad:** na každé nově zřízené databázi (nová Neon branch, test branch, lokální DB, obnovený dump) není identita člena vázaná na účet; smazání účtu v Neon Auth nevyčistí `household_members` (osiřelé jméno, `user_id` na neexistující účet — GDPR).

**Ověřte živé schéma** (`\d household_members`): pokud FK v produkci chybí, je kritické; pokud existuje, jde o drift baseline vs. produkce, který se projeví při nejbližší nové branchi. **Oprava:** doplnit migraci `ALTER TABLE household_members ADD CONSTRAINT … FOREIGN KEY (user_id) REFERENCES neon_auth."user"(id) ON DELETE SET NULL;` (po kontrole osiřelých řádků) a opravit komentáře v `schema.ts` a `0041`. Zavést kontrolu driftu schema vs. migrace do CI.

#### V4 — Zranitelné závislosti v produkčním grafu

`pnpm audit --prod` → **62 nálezů: 1 critical, 26 high, 29 moderate, 6 low** (snapshot k datu auditu).

Klíčové:

* **`sharp@0.35.3`** (`package.json:68`) — 2× high (libheif GHSA-g89c-p67h-r497 / GHSA-2jg2-4ch7-h545; librsvg CVE-2026-96889). `sharp` dekóduje **nahrané účtenky** (`lib/receipt-image.ts:179,258`) i obrázky z cizích webů (`lib/recipes/importer.ts:151`) → dosažitelná plocha pro zneužití nativních dekodérů.
* **`shadcn@^4.11.0` je v `dependencies`** (`package.json:67`), ale **nikde se neimportuje** (scaffolding CLI). Tahá s sebou `@modelcontextprotocol/sdk` → `express` → `proxy-addr` (**critical**, IP spoofing), `fast-uri` (7× high), `ip-address`, `js-yaml`, `hono`, `qs`, `braces`, `undici`. Přesun do `devDependencies` odstraní critical a většinu high z `--prod`.
* **`undici`** (přes `ai` → `@ai-sdk/provider-utils`) — 2× high (TLS bypass, DoS).
* Většina ostatních high (`brace-expansion`, `browserslist`, `source-map-js`, `nanoid`, `esbuild`, `postcss-selector-parser`) je build-time/dev tooling — v produkci nedosažitelné, ale zbytečně v grafu.

**Oprava:** `sharp>=0.35.5` + `pnpm.overrides` na `sharp`/`undici` (aby se záplata propsala do vnořených kopií `next`/`better-auth`); přesunout `shadcn` do `devDependencies`; zvážit odstranění `shadcn` úplně (`pnpm dlx shadcn`).

#### V5 — Nasazení přes nepřipnutý `npx vercel@latest` s produkčním tokenem

`vercel.json:137-139` má `"git": { "deploymentEnabled": false }` → jediná cesta k produkci je `.github/workflows/vercel-deploy.yml:30`:

```yaml
run: npx vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN"
```

`npx vercel@latest` stahuje z npm v době běhu bez pinu a bez kontroly integrity; kompromitovaný release by získal produkční token (a `--yes` znamená bez potvrzení). Vedlejší vada: `:27` čte `github.event.workflow_run.head_sha`, ale workflow je jen `workflow_dispatch` → mrtvá větev.

**Oprava:** připnout `vercel` do `devDependencies` a volat `pnpm exec vercel`; ideálně nahradit `--token` OIDC (projekt už GCP OIDC používá, `lib/gcp-oidc.ts`).

#### V6 — Únik SQL parametrů a interních detailů do logů a odpovědí

Drizzle konstruuje chyby jako (`node_modules/drizzle-orm/errors.js`):

```js
super(`Failed query: ${query}\nparams: ${params}`);
```

`describeError` (`lib/errors.ts:21`) tuto zprávu propouští dál a `redactSecrets` (`lib/receipt-log.ts:57-63`) sekci `params:` **nemaskuje** (maže jen `key=`, `Bearer`, `Subscription-Key`). Konkrétní dosah:

* `app/api/cron/import-stores/route.ts:26-28` a `app/api/cron/albert-store-formats/route.ts:24-26` → `NextResponse.json({ error: message })` — chyba DB se dostane do těla HTTP odpovědi (názvy tabulek/sloupců, hodnoty parametrů). Zmírněno tím, že routy vyžadují `CRON_SECRET`.
* `app/actions/receipts.ts:150` — `receipt_upload_failed` loguje `err.message` **raw** (chyby R2/AWS SDK běžně obsahují podepsanou URL s `X-Amz-Credential`/`X-Amz-Signature`).

**Oprava:** rozšířit `redactSecrets` o `params: [redacted]`, `scheme://user:pass@`, `api[-_]?key`, `token`, `secret`, `signature`, `X-Amz-*`, `AWS4-HMAC-*`; zavést `safeDbErrorMessage()` v `lib/errors.ts` a použít v cron routách i v logu uploadu.

#### V7 — `retryReceiptImportAction` obchází limit a bez stropu opakuje placená OCR/LLM volání

`app/actions/receipts.ts:211-219` přijímá stavy `['ocr_failed','parsing_failed','uploaded']`, ale denní limit 30/24 h (`lib/receipt-upload-limit.ts:6`, kontrolovaný v `app/actions/receipts.ts:106-135`) se počítá jen z **nově nahraných** `receipt_imports`. Retry žádný řádek nevytváří, a `processReceiptImport` (`lib/receipt-import.ts:519,623-664`) při každém pokusu **znovu volá placené providery** (OCR i `geminiStructuringProvider`) — `raw_ocr_text` se znovu nepoužije.

**Důsledek:** jedna účtenka, která spolehlivě projde OCR, ale selže na parsování, se dá mezi `parsing_failed` a dalším placeným voláním cyklit **bez limitu**. Server Actions nemají rate limiting → řízené vyčerpání měsíčního AI/OCR kreditu. Jde o známý, dosud neopravený bod (`docs/06_KNOWN_ISSUES.md:19`, `docs/01_CURRENT_STATE.md:207`).

**Oprava:** počítat každé zpracování (např. `receipt_imports.process_attempts` + strop kontrolovaný v `claimReceiptImport`), případně cachovat výstup OCR v `raw_ocr_text`/`parser_result` a při retry ho znovu použít.

#### V8 — Registrace a přihlášení bez CAPTCHA a bez rate limitu (abuse + brute force)

`app/auth/sign-up/page.tsx:27-43` je obyčejné `signUp.email(...)` bez CAPTCHA (grep `captcha|turnstile|recaptcha` v celém repu → 0 výskytů v kódu). Po registraci si účet okamžitě založí vlastní domácnost (`app/page.tsx:31` → `getHouseholdData`), a tím získá **plnou denní kvótu 30 placených OCR/LLM volání**. Cesta útoku: hromadně zakládat účty → každý z nich = 30 placených volání/den bez globálního stropu. `/api/auth/*` jen přeposílá do Neon Auth (`app/api/auth/[...path]/route.ts:3`), jehož rate limit/CAPTCHA/ověření e-mailu **nelze z repa ověřit**.

**Oprava:** v Neon Auth zapnout ověření e-mailu a rate limiting; přidat CAPTCHA na registraci; zavést globální denní strop na domácnost/účet. Do té doby nepředpokládat, že Neon Auth nějakou ochranu poskytuje.

---

### 3.3 STŘEDNÍ

| # | Nález | Místo |
|---|---|---|
| S1 | **Žádné RLS + připojení jako `neondb_owner`** (vlastník tabulek RLS implicitně obchází). Izolace tenantů stojí výhradně na ručních `where household_id`; řada tabulek (`shopping_list_items`, `purchase_items`, `purchase_item_expense_splits`, `shopping_list_item_pins`, `member_diets`, `member_notification_settings`, `recurring_payment_occurrences`) `household_id` nemá a musí joinovat. Jedna zapomenutá podmínka = přístup ke všem domácnostem. | `lib/db/schema.ts`, `lib/db/client.ts:35` |
| S2 | **Chybí smazání účtu a domácnosti; neomezená retence PII** (jména, děti vč. `specialNeeds`, alergie, `invitations.email`, `receipt_imports.raw_ocr_text/parser_result/items`, fotky účtenek, push pověření). `ON DELETE CASCADE` je správně, ale chybí cesta, která by ho použila. | `lib/db/schema.ts:118,817-837`, žádný `deleteAccount` |
| S3 | **Nešifrovaný `pg_dump` celé DB včetně `neon_auth`** (hashovaná hesla, `accessToken`/`refreshToken`/`idToken`) do `backups/`. | `scripts/backup-db.ts:6-23` |
| S4 | **Migrace bez transakce a bez checksumu**; `pnpm build` migruje produkci před buildem, částečný stav zůstane živý. `splitStatements` dělí na `;`+newline. | `lib/db/migrate.ts:27-30,99-111` |
| S5 | **Chybí CHECK constraints** na penězích/měnách/množstvích: `prices.regular_price/unit_price > 0`, `valid_until >= valid_from`, `currency ~ '^[A-Z]{3}$'`, `deals.deal_price > 0`, `shopping_list_items.quantity > 0`, `purchases.total >= 0`, `expenses.amount > 0`, `profiles/children.age BETWEEN 0 AND 120`, `receipt_imports.total >= 0` atd. (CLAUDE.md §8, §33). | `lib/db/schema.ts` (výčet v oddílu 4) |
| S6 | **Chybí kontrola role u `updateHouseholdAction`, `updateHouseholdPreferencesAction`, `addHouseholdMemberAction`** (jen `requireHouseholdId()`); kterýkoli člen přepíše název domácnosti, sdílený rozpočet, preference. | `app/actions/household.ts:18,35,101` |
| S7 | **Pozvánka není atomicky jednorázová** — insert členství + samostatný `update status='accepted'`; dva účty se stejným e-mailem projdou oba. | `lib/db/queries.ts:240-250` |
| S8 | **Bez limitů délky volného textu** (`name`, `note`, `detail`, `preferences`, e-mail bez validace formátu) při 15 MB těle Server Actions. | `app/actions/shopping.ts:58-63,188`, `app/actions/household.ts:18,72,122` |
| S9 | **`getInvitationByToken` nefiltruje stav/expiraci a vrací e-mail pozvaného**; veřejná `/invite/[token]` zobrazuje e-mail a název domácnosti komukoli s odkazem. | `lib/db/queries.ts:740-745`, `app/invite/[token]/page.tsx:45-66` |
| S10 | **E-mail pozvánky se normalizuje jen při čtení** (`userEmail.toLowerCase()`), ale při zápisu ne → `Jan.Novak@Example.cz` vs `jan.novak@example.cz` se neshodnou (tichá ztráta funkce). | `lib/db/queries.ts:492`, `lib/db/schema.ts:118` |
| S11 | **Service worker cachuje HTML přihlášeného uživatele**; mazání při odhlášení je best-effort se spolknutou chybou (`catch { console.error }`). Na sdíleném telefonu bez signálu se otevře cizí nákupní seznam. | `public/sw.js:38-52`, `components/shared/app-header.tsx:35-46` |
| S12 | **Offline fronta zůstává v `localStorage` po odhlášení** (názvy položek, ceny, v plaintextu). | `lib/offline-queue.ts:94`, `components/shell/use-shopping-queue.ts` |
| S13 | **`minimumReleaseAge` není nastavené**, takže `minimumReleaseAgeExclude` je inertní — pnpm přijme nově publikovanou (i kompromitovanou) verzi okamžitě. | `pnpm-workspace.yaml:3-5` |
| S14 | **Chybí COOP/CORP, `Content-Disposition` a `poweredByHeader: false`.** HSTS **je v pořádku** — přidává ho Vercel (ověřeno na živé produkci: `max-age=63072000; includeSubDomains; preload`). `x-powered-by: Next.js` je odhalené. PDF účtenky se otevírají inline (`app/api/receipts/[id]/image/route.ts:21-29` nastaví `Content-Type`/`nosniff`/`no-store`, ale ne `Content-Disposition`). | `next.config.mjs:40-46` |
| S15 | **Lokální auth bez politiky hesel a rate limitu** (`emailAndPassword` bez `minPasswordLength`, `requireEmailVerification`, `rateLimit`); aktivní kdykoli je `DATABASE_URL` loopback nebo `DATABASE_DRIVER=pg`. | `lib/auth/local.ts:22-32` |
| S16 | **Přesné GPS souřadnice v cache klíčích** (`localityKey = JSON.stringify(locality)`), uložené v Next Data Cache 24 h. | `lib/db/store-branch-search.ts:80-85` |
| S17 | **`store_locations ON DELETE CASCADE` maže historii cen** — smazání pobočky nevratně odstraní `prices`/`deals` (v rozporu s CLAUDE.md §16). | `lib/db/schema.ts:451,532,554` |
| S18 | **Žádný audit trail** změn dat domácnosti (kdo změnil rozpočet/výdaj). | — |
| S19 | **`JSON.parse` bez ošetření** — poškozený řádek shodí render stránky / akci. | `lib/db/queries.ts:171`, `app/actions/receipts.ts:241,291` |
| S20 | **`fetchWithTimeout` je obecný fetcher bez SSRF ochrany** — bez allowlistu hostů, bez kontroly privátních IP, bez limitu velikosti odpovědi; používá se na `page.imageUrl` z letáků (`lib/ingestion/flyer.ts:101`). Na rozdíl od dobře ošetřeného `lib/recipes/importer.ts:75-96`. | `lib/ingestion/http.ts:36-46` |
| S21 | **Obcházení kontroly privátních IP přes IPv4-mapované IPv6** — `lib/recipes/importer.ts:57-73` kontroluje jen `::`, `::1`, `fc…`, `fd…`, `fe80:`; `::ffff:169.254.169.254` projde (a chybí `100.64.0.0/10`, `198.18.0.0/15`, `192.0.0.0/24`). Vyžaduje attacker-controlled host v allowlistu → nízké, ale jde o jasný bypass. | `lib/recipes/importer.ts:57-73` |
| S22 | **Better Auth pg fallback důvěřuje `Host`/`Origin` hlavičce** — bez `BETTER_AUTH_URL` a `trustedOrigins` si baseURL odvozuje z requestu. Platí jen při nasazení s `DATABASE_DRIVER=pg`/non-loopback (ne produkční Neon cesta), ale při hostovaném fallbacku by to umožnilo obcházení same-origin kontroly. | `lib/auth/local.ts:22-32` |
| S23 | **Household preference v klíči sdílené Next Data Cache** — `getDealsPage` cachuje i `preferred`/`excluded` seznamy (`lib/db/deals.ts:21-32`). Není to únik mezi domácnostmi (parametry jsou součástí klíče), ale PII-ish data zůstávají v cache (a v Cloudflare buildu v R2 `shopping-buddy-next-cache`). | `lib/db/cached-reads.ts:23-32` |

---

### 3.4 NÍZKÉ

* **L1** Nevalidovaný `?invite=` v `router.push` — není open redirect (pevný prefix `/invite/`), ale nevalidovaný vstup. `app/auth/sign-in/page.tsx:39`, `app/auth/sign-up/page.tsx:41`.
* **L2** GitHub Actions pinované na tagy (`@v4`), ne na SHA. `.github/workflows/*.yml`.
* **L3** `manual-recipe-import.yml:29-38` má fallback volání **bez** hlavičky a volnou `production_url` — překlep pošle `CRON_SECRET` cizímu hostu. Fallback smazat, URL na whitelist.
* **L4** `next.config.mjs:7` — mrtvá `const isDev`. `public/placeholder-*` — zbytky v0 scaffoldu. `.github/workflows/main.yml` — legacy na Node 20, volá `pnpm test` bez `.env.local`.
* **L5** `userFacingError` (`lib/errors.ts:5-9`) zobrazí jakoukoli zprávu, která „nevypadá jako minified React error“ — křehká allow-list.
* **L6** `_migrations` a `_migration_lock` nejsou v Drizzle schématu (drift).
* **L7** Nevalidované enum hodnoty z klienta (`unit`, `category`, `priority`, `onSale`) — zachytí až Postgres. `app/actions/shopping.ts:185-189`.
* **L8** `product_category_changes.decided_by` / `product_subcategory_changes.decided_by` bez FK. `lib/db/schema.ts:1318,1345`.
* **L9** Push `p256dh`/`auth` v otevřené podobě (inherentní, ale dump je vystavuje) — viz S3.
* **L10** `scratch-wolt3-requests.json` a `scratch-wolt4-requests.json` (netrackované, gitignorované) obsahují `access_token`/`refresh_token`/`bearer`-podobné řetězce. Nikdy nebyly commitnuté, ale je to jediné místo v repu, kde mohou ležet živé tokeny — doporučuji smazat. | kořen repa |

---

## 4. Databázová integrita — konkrétní výčet chybějících CHECK omezení

Toto je pracovní seznam pro budoucí dávku migrací (`ADD CONSTRAINT … CHECK (… NOT VALID)` + `VALIDATE CONSTRAINT`):

| Tabulka / sloupec | Požadované omezení | `lib/db/schema.ts` |
|---|---|---|
| `prices.regular_price`, `prices.unit_price` | `> 0` | :455, :461 |
| `prices.currency` / `deals.currency` / `households.currency` / `receipt_imports.currency` | `~ '^[A-Z]{3}$'` | :459, :534, :72, :820 |
| `prices.valid_until` vs `valid_from` | `>=` | :465-466 |
| `deals.deal_price` | `> 0` | :533 |
| `deals.valid_until` vs `valid_from` | `>=` | :541-542 |
| `shopping_list_items.price`, `.quantity` | `>= 0`, `> 0` | :574, :578 |
| `purchases.total`, `.discount` | `>= 0` | :628-629 |
| `purchase_items.price`, `.quantity` | `>= 0`, `> 0` | :642-644 |
| `expenses.amount` | `> 0` | :858 |
| `profiles.age`, `children.age` | `BETWEEN 0 AND 120` | :135, :145 |
| `invitations.expires_at` | `> created_at` | :124 |
| `receipt_imports.subtotal`/`discount_total`/`total` | `>= 0` | :821-825 |
| `meal_plans.budget_limit`/`estimated_total` | `>= 0` | :1026-1027 |

(Pozitivně: už existují dobré CHECKy — rozpočtový den 1-28, kladná velikost balení a kanonická jednotka, `valid_until >= valid_from` u `flyer_pages`, kladné intervaly, kladné budget limity, `https://` u push endpointu atd.)

---

## 5. Dokumentace vs. realita (drift)

Kromě CSP (K1) dokumentace zaostává na dalších místech:

* `docs/01_CURRENT_STATE.md:213` a `docs/09_BACKUP_RECOVERY.md` tvrdí, že `/api/health` dělá `select 1` do DB a vrací 200/503 — skutečná routa (`app/api/health/route.ts`) **záměrně DB nevolá** (větev `fix/health-check-no-db-20261003`). Dokumentaci aktualizovat.
* `docs/01_CURRENT_STATE.md:207` (a `docs/06_KNOWN_ISSUES.md:19`) správně přiznává, že `retryReceiptImportAction` se nepočítá do upload limitu — zůstává otevřené.
* Duplikace dokumentů (`02_ARCHITECTURE` vs `02_PROJECT_CONTEXT`, `03_DATABASE` vs `04_DATABASE_MODEL`, `03_CHANGELOG` vs `07_CHANGELOG`) je už zaznamenaná v `docs/01_CURRENT_STATE.md:219`.
* `docs/01_CURRENT_STATE.md:214` uvádí „CSP without unsafe-inline (nonce-based)“ jako **otevřený** bod — to je správně a koresponduje s K1, ale je v rozporu s řádkem :204, který CSP popisuje jako hotovou.

---

## 6. Doporučený plán oprav

Fáze 0 — **dořešit mergi** (viz oddíl 7), jinak se nedá spolehlivě říct, co je „nasazené“.

Fáze 1 — **rychlé a kritické** (0,5–1 den):

1. CSP: odstranit `experimental.csp`, nasadit nonce-based (nebo alespoň statickou) CSP + opravit dokumenty. *(K1)*
2. Auto-join: podmínit ověřeným e-mailem nebo zrušit; zapnout verifikaci e-mailu v Neon Auth. *(K2)*
3. `shadcn` → `devDependencies`; `sharp>=0.35.5` + overrides. *(V4)*
4. Pin `vercel` v deploy workflow. *(V5)*
5. `redactSecrets`/`safeDbErrorMessage` + nasazení v cron a upload logu. *(V6)*
6. Strop na opakované zpracování účtenky + cache OCR výstupu. *(V7)*
7. CAPTCHA + rate limiting na auth; ověřit/zdokumentovat ochrany Neon Auth. *(V8)*

Fáze 2 — **autorizace a integrita** (1–2 dny):

8. Role check + ochrana posledního vlastníka u `removeHouseholdMemberAction`. *(V2)*
9. Oddělit změnu sdíleného katalogu od přepisu cizích `expenses`. *(V1)*
10. Ověřit a doplnit FK na `neon_auth."user"`. *(V3)*
11. CHECK constraints (oddíl 4). *(S5)*

Fáze 3 — **hloubková obrana** (průběžně):

12. Oddělená aplikační role bez DDL + RLS (největší práce, jediná skutečná obrana do hloubky). *(S1)*
13. Smazání účtu/domácnosti + retence účtenek (GDPR). *(S2)*
14. Šifrované zálohy. *(S3)*
15. Migrace: checksum + transakce + guard na produkci. *(S4)*
16. Rate limiting na auth/upload; politika hesel v lokálním režimu; COOP/CORP, `poweredByHeader`, `Content-Disposition`. *(S14, S15)*
17. Zbytek S/L jako průběžné zpevňování.

---

## 7. Stav pracovního stromu (mimo bezpečnost, ale blokuje nasazení)

Pracovní strom je uprostřed **nevyřešeného mergi** na větvi `feat/new-flyer-notifications`:

```
UU docs/07_CHANGELOG.md
UU docs/14_NOTIFICATION_PREFERENCES.md
UU lib/notification-kinds.ts
UU lib/notification-kinds.test.ts
AA docs/21_NEW_FLYER_NOTIFICATIONS.md
```

V kořeni leží necommitnuté `scratch-*` soubory (s daty z retailerů, gitignorované) a `tsconfig.tsbuildinfo` (gitignorované). Před jakýmkoli hodnocením „co je nasazené“ je nutné mergi dořešit; teprve pak dává smysl audit uzavřít jako závazný.

---

## 8. Obecné postřehy k projektu (mimo bezpečnost)

* **Velikost:** 492 TS/TSX souborů, ~61 000 řádků; 312 zdrojových souborů vs. 152 testovacích (solidní pokrytí logikou/testy).
* **Největší soubory** (kandidáti na rozdělení): `lib/db/queries.ts` (100 KB), `lib/db/schema.ts` (90 KB), `lib/product-types.ts` (53 KB), `lib/product-subcategories.ts` (48 KB), `lib/receipts.ts` (46 KB), `components/app-shell.tsx` (44 KB), `lib/receipt-import.ts` (42 KB).
* **Žádná ESLint konfigurace a žádný `lint` skript.** `CLAUDE.md` (Working Method, step 4) předepisuje `pnpm lint` a `pnpm typecheck` — **ani jeden z těchto skriptů v `package.json` neexistuje** (existuje jen `pnpm build` + `pnpm exec tsc --noEmit` v CI). Buď skripty doplnit, nebo opravit `CLAUDE.md`.
* **`any`:** 11 výskytů (CLAUDE.md §9 požaduje zdokumentovaný důvod). TODO/FIXME: 2.
* **Schéma:** 53 tabulek, 79 FK, 80 `onDelete`, 29 CHECK, 23 unikátních indexů — struktura je vyspělá; chybí spíš doménové CHECKy (oddíl 4) než FK.

---

## 9. Co nebylo možné z repozitáře ověřit

1. **Živé produkční schéma** (FK z V3, drift) — nutno `\d household_members` proti Neon.
2. **Konfigurace Neon Auth** — ověření e-mailu, rate limiting, CAPTCHA, politika hesel, chybové zprávy přihlášení (enumerační riziko). K2 a V8 závisí na tomto.
3. **Chování přihlášených stránek** — ověřeny jen veřejné hlavičky (`/`, `/api/health`); lokální TLS selhal, `node fetch` na produkci prošel.
4. **Chování Next.js 16 v produkci** — zda vždy nahradí zprávu chyby Server Action (na čem stojí `userFacingError`). Doporučuji e2e ověření.
5. **Reálná zneužitelnost CVE** (např. zda HEIC z iPhonu projde detekcí a dosáhne na zranitelný `sharp`).
6. **RLS/role v Neon** — zda je `neondb_owner` jediná role a jaké má limity.
7. **Cloudflare build** — zda poskytuje HSTS (na Vercelu ho přidává platforma, ve `wrangler.jsonc` ani `next.config.mjs` nastaveno není).

---

*Report vygenerován statickou analýzou; žádná položka není zapsána do `docs/07_CHANGELOG.md` (tam patří až dokončené opravy).*
