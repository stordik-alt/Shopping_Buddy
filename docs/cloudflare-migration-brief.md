> **Scope decision (owner, 2026-09-25): for now only Vercel Blob → Cloudflare R2 is migrated.**
> Hosting, crons, OCR authentication, AI Gateway, analytics and DNS stay on Vercel for the time
> being; the sections of this brief about those are kept as the long-term plan, not current work.
> Current scope and status: `docs/cloudflare-migration-status.md`.
>
> This is the owner's original migration brief, kept for reference. Requirements that do not match
> the verified code are listed in `docs/cloudflare-migration-audit.md` section 11.

# Shopping_Buddy – COMPLETE VERCEL → CLOUDFLARE MIGRATION

## PRIORITA Č. 1

**Kompletní migrace projektu Shopping_Buddy z Vercelu na Cloudflare je nyní PRIORITA Č. 1.**

Cílem je postupně odstranit závislost projektu na Vercelu a přesunout produkční infrastrukturu na Cloudflare.

Migrace musí být provedena **bez plánované odstávky aplikace**.

Vercel nesmí být odstraněn ani vypnut, dokud nebude Cloudflare varianta kompletně ověřena a připravena jako produkční náhrada.

---

# 0. CLOUDFLARE AGENT SETUP – POVINNÝ PRVNÍ KROK

Before doing anything else in this task, execute the official Cloudflare agent setup instructions:

https://developers.cloudflare.com/agent-setup/prompt.md

Požadavky:

1. Načti aktuální oficiální instrukce Cloudflare.
2. Proveď jejich nastavení.
3. Ověř, že Cloudflare připojení funguje.
4. Ověř dostupné Cloudflare capabilities.
5. Ověř možnost práce s R2.
6. Ověř možnosti deploymentu aplikace na Cloudflare.
7. Neprováděj změny produkčních Cloudflare resources před dokončením setupu.
8. Nikdy nevypisuj secrets, API keys, tokens nebo credentials.
9. Pokud je nutná akce uživatele, zastav se a přesně popiš, co musí uživatel provést.

Tento krok je POVINNÝ a musí být proveden jako první.

---

# 1. HLAVNÍ CÍL

Migruj Shopping_Buddy z:

```text
Vercel
├── Next.js hosting
├── Vercel Blob
├── Vercel-specific services
└── Vercel deployment infrastructure
```

na cílovou architekturu:

```text
Cloudflare
├── Workers / Cloudflare-compatible Next.js runtime
├── R2
├── Cloudflare security / WAF
├── Cloudflare deployment
└── Cloudflare-compatible services
```

Databáze:

```text
Neon PostgreSQL
```

zůstává zachována, pokud audit neprokáže důvod k její migraci.

OCR provider a OCR business logic musí zůstat funkčně zachovány.

---

# 2. ZÁSADNÍ PRAVIDLO – ŽÁDNÁ PLÁNOVANÁ ODSTÁVKA

Migrace musí probíhat postupně.

V průběhu migrace musí být možné provozovat:

```text
Vercel = současná produkce
Cloudflare = nová infrastruktura
```

paralelně.

Nikdy neprováděj:

```text
Vypnout Vercel
↓
teprve potom vytvořit Cloudflare
```

Správný postup:

```text
Vercel production
        │
        ├── současný provoz
        │
        └── postupná migrace
                    │
                    ▼
              Cloudflare
                    │
                 testování
                    │
                    ▼
              production
                    │
                    ▼
             Vercel rollback
```

Vercel musí zůstat funkční až do definitivního potvrzení migrace.

---

# 3. POVINNÁ DOKUMENTACE – ZMĚNY SE MUSÍ PRŮBĚŽNĚ ZAPISOVAT

**Každá významná změna provedená během migrace musí být průběžně zapsána do dokumentace projektu.**

Dokumentace nesmí být vytvořena pouze na konci.

Po každé významné fázi aktualizuj příslušné dokumenty v:

```text
docs/
```

Minimálně udržuj:

```text
docs/cloudflare-migration-audit.md
docs/cloudflare-migration-status.md
docs/cloudflare-migration-architecture.md
```

Podle potřeby vytvoř další dokumentaci, například:

```text
docs/cloudflare-r2.md
docs/cloudflare-deployment.md
docs/cloudflare-environment.md
docs/cloudflare-rollback.md
docs/cloudflare-troubleshooting.md
```

Dokumentace musí odpovídat skutečnému stavu projektu.

### Při každé významné změně zaznamenej minimálně:

- co bylo změněno
- proč byla změna provedena
- které soubory byly změněny
- jaké nové soubory vznikly
- jaké environment variables byly přidány nebo změněny
- jaké Cloudflare resources byly vytvořeny nebo změněny
- jaké databázové změny byly provedeny
- jaké testy byly spuštěny
- výsledek testů
- výsledek buildu
- případná rizika
- případné rollback kroky
- co je další krok

### Důležité

Nikdy neuváděj do dokumentace skutečné:

- API keys
- access tokens
- secrets
- passwords
- private credentials

Dokumentuj pouze názvy proměnných, typ konfigurace a bezpečný popis.

### Dokumentace musí být aktualizována ještě před přechodem na další významnou fázi.

Pokud změna ovlivňuje architekturu, deployment, storage, databázi, OCR, upload nebo bezpečnost, musí být odpovídající dokumentace aktualizována v rámci stejného commitu nebo nejpozději před pokračováním do další fáze.

---

# 4. NEJDŘÍVE PROVEĎ KOMPLETNÍ AUDIT

Před změnou kódu vytvoř kompletní audit projektu.

Repo:

```text
stordik-alt/Shopping_Buddy
```

Branch:

```text
main
```

Zjisti:

- framework
- runtime
- build systém
- API routes
- server actions
- middleware/proxy
- environment variables
- storage
- authentication
- caching
- cron jobs
- background processing
- OCR
- file uploads
- database
- analytics
- deployment configuration
- všechny Vercel-specific dependencies

Výsledky zapiš do:

```text
docs/cloudflare-migration-audit.md
```

---

# 5. VERCEL DEPENDENCY AUDIT

Nehledej pouze:

```text
@vercel/blob
```

Prohledej celý projekt.

Hledej minimálně:

```text
@vercel/*
vercel.json
BLOB_READ_WRITE_TOKEN
Vercel Blob
vercel
VERCEL_
put(
del(
list(
head(
```

Dále:

```text
Vercel-specific API
Vercel-specific runtime
Vercel-specific headers
Vercel-specific caching
Vercel-specific authentication
Vercel-specific environment variables
Vercel deployment assumptions
Vercel-specific analytics
Vercel-specific OIDC
```

Zkontroluj také `package.json`.

Každou Vercel-specific závislost zařaď:

```text
CURRENT VERCEL DEPENDENCY
CLOUDFLARE REPLACEMENT
MIGRATION PRIORITY
MIGRATION RISK
STATUS
```

V této fázi nic zbytečně neodstraňuj.

Výsledky průběžně zapisuj do dokumentace.

---

# 6. MIGRAČNÍ STRATEGIE

Použij postupnou migraci:

```text
PHASE 1
Audit
    ↓
PHASE 2
Storage abstraction
    ↓
PHASE 3
Vercel Blob → Cloudflare R2
    ↓
PHASE 4
Provider-neutral application
    ↓
PHASE 5
Cloudflare staging
    ↓
PHASE 6
Full application testing
    ↓
PHASE 7
Production cutover
    ↓
PHASE 8
Rollback window
    ↓
PHASE 9
Remove Vercel
```

Po dokončení každé fáze:

1. aktualizuj dokumentaci
2. spusť odpovídající testy
3. zaznamenej výsledek
4. teprve potom pokračuj dál

---

# 7. PHASE 1 – AUDIT

Pouze audit.

Vytvoř dokument:

```text
docs/cloudflare-migration-audit.md
```

Musí obsahovat:

- všechny Vercel dependencies
- všechny storage dependencies
- všechny deployment dependencies
- všechny environment variables
- všechny API routes
- všechny runtime assumptions
- všechny potenciální Cloudflare compatibility issues
- doporučené Cloudflare alternativy
- rizika
- pořadí migrace

V této fázi neměň produkční logiku.

Po dokončení aktualizuj:

```text
docs/cloudflare-migration-status.md
```

---

# 8. PHASE 2 – STORAGE ABSTRACTION

Vytvoř provider-neutral storage vrstvu.

Například:

```text
lib/storage/
├── types.ts
├── storage.ts
├── r2.ts
└── vercel-blob.ts
```

API musí umožnit minimálně:

```text
createUploadUrl()
createDownloadUrl()
deleteFile()
fileExists()
```

Aplikace nesmí být přímo závislá na implementaci R2.

Musí být možné přepnout:

```text
STORAGE_PROVIDER=vercel
```

nebo:

```text
STORAGE_PROVIDER=r2
```

Ideálně podporuj také migrační režim:

```text
STORAGE_PROVIDER=dual
```

Dokumentuj:

- novou architekturu
- důvod abstraction layer
- interface
- implementace
- způsob přepnutí provideru

---

# 9. PHASE 3 – CLOUDFLARE R2

R2 je první skutečná migrace.

Použij S3-compatible API.

Potřebné balíčky podle aktuálního stavu projektu:

```text
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

Použij aktuální doporučení Cloudflare.

Environment variables:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
```

Secrets nesmí být dostupné klientovi.

Bucket musí být private.

Dokumentuj:

- bucket
- environment
- storage architecture
- access model
- presigned URL model
- security model

Nikdy do dokumentace nezapisuj hodnoty secretů.

---

# 10. R2 STORAGE STRUCTURE

Preferuj například:

```text
receipts/{userId}/{receiptId}/original.jpg
receipts/{userId}/{receiptId}/compressed.jpg
receipts/{userId}/{receiptId}/ocr-source.jpg
receipts/{userId}/{receiptId}/receipt.pdf
```

Nepoužívej expiring URL jako trvalou hodnotu v databázi.

Do DB ukládej:

```text
storage_provider
storage_key
mime_type
file_size
original_filename
```

pokud tyto údaje již nejsou dostupné jiným způsobem.

Aktualizuj dokumentaci DB modelu a storage architektury.

---

# 11. UPLOAD PIPELINE

Zachovej současnou funkcionalitu:

```text
User
 ↓
file validation
 ↓
compression / resize
 ↓
upload
 ↓
R2
 ↓
OCR
 ↓
import
```

Důležité:

**Fotografie musí být komprimována ještě před uploadem, pokud to současná logika vyžaduje.**

Ověř to skutečným testem.

Neakceptuj pouze tvrzení v kódu.

Zkontroluj:

```text
original size
compressed size
uploaded size
OCR source size
```

Výsledky testů zapiš do dokumentace.

---

# 12. BASE64 AUDIT

Zvláštní pozornost věnuj Base64.

Projekt měl problémy s:

```text
Maximum array nesting exceeded
React error #441
```

a velkými fotografiemi.

Zjisti všechny případy:

```text
File → Base64
Base64 → JSON
Base64 → React state
Base64 → OCR
```

Pokud je možné bezpečně použít:

```text
Buffer
Blob
ArrayBuffer
Stream
R2 object
```

preferuj tyto mechanismy.

Nesmíš však změnit OCR chování bez testů.

Výsledky zapiš do migrační dokumentace.

---

# 13. OCR MUSÍ ZŮSTAT FUNKČNĚ STEJNÉ

Migrace storage nesmí měnit business logiku OCR.

Otestuj minimálně:

```text
JPG
PNG
PDF
compressed JPG
large JPG
small JPG
```

Ověř:

```text
upload
compression
OCR
OCR result
import
```

Zapiš výsledky testů.

---

# 14. IMPORT REGRESSION TESTS

Povinně otestuj současnou logiku.

### 1 produkt

```text
1 OCR product
→ 1 DB record
```

### 2 produkty

```text
1 OCR input
→ 2 DB records
```

Každý musí mít vlastní:

```text
calculated values
product
```

### Pending approval

Musí fungovat:

```text
OCR
→ pending
→ Product Profile
→ assignment
→ recalculation
→ save
```

### Reimport

Musí fungovat:

```text
existing record
→ reject reason = reimport
→ new import
→ no duplicate
```

Výsledky musí být zapsány do dokumentace.

---

# 15. BACKWARD COMPATIBILITY

Během migrace musí aplikace umět číst:

```text
storage_provider = vercel_blob
```

i:

```text
storage_provider = r2
```

Staré účtenky nesmí přestat fungovat.

Musí fungovat:

- preview
- download
- OCR source
- reimport
- delete

Toto musí být zdokumentováno a otestováno.

---

# 16. MIGRATION SCRIPT

Vytvoř:

```text
scripts/migrate-vercel-blob-to-r2.ts
```

Sekvence:

```text
Vercel Blob
 ↓
download
 ↓
upload R2
 ↓
verify
 ↓
update DB
```

Původní Vercel Blob nesmí být odstraněn před ověřením.

Migrace musí být:

- idempotentní
- restartovatelná
- bezpečná
- logovatelná
- bez duplicit

Podporuj:

```text
--dry-run
```

Dry run nesmí:

- uploadovat
- měnit DB
- mazat soubory

Dokumentuj způsob použití, bezpečnost a rollback.

---

# 17. DUAL STORAGE

Pokud to architektura dovolí, implementuj dočasný režim:

```text
STORAGE_PROVIDER=dual
```

Nový soubor:

```text
upload
 ├── R2
 └── Vercel Blob
```

Aplikace musí používat R2 jako primární zdroj.

Vercel Blob slouží pouze jako dočasný fallback / rollback.

Tento režim používej pouze během migračního období.

Dokumentuj přesně:

- kdy se používá
- jak se aktivuje
- jak se vypíná
- jak funguje fallback
- jak se ověřuje konzistence

---

# 18. CLOUDFLARE STAGING

Před production cutover vytvoř Cloudflare staging prostředí.

Musí být možné provozovat:

```text
Vercel production
Cloudflare staging
```

současně.

Cloudflare staging musí používat bezpečnou konfiguraci a pokud možno oddělené resources od production.

Dokumentuj staging architekturu a konfiguraci.

---

# 19. CLOUDFLARE PRODUCTION

Po úspěšném staging testu připrav production:

```text
Cloudflare production
```

Ale nepřepínej hlavní doménu okamžitě.

Nejdříve ověř:

- build
- deployment
- environment variables
- database
- R2
- OCR
- API
- authentication
- upload
- import
- mobile
- security
- performance

Výsledky musí být zapsány do:

```text
docs/cloudflare-migration-status.md
```

---

# 20. ZERO-DOWNTIME CUTOVER

Přepnutí musí být připraveno tak, aby:

```text
Vercel = rollback
Cloudflare = primary
```

V okamžiku přepnutí nesmí dojít k mazání dat.

Pokud Cloudflare selže:

```text
Cloudflare
   ↓
rollback
   ↓
Vercel
```

Rollback musí být co nejrychlejší.

Rollback postup musí být před production cutoverem zdokumentován.

---

# 21. DOMÉNA / DNS

Před změnou DNS ověř:

- TTL
- SSL
- DNS records
- Cloudflare proxy
- custom domain
- redirects
- cookies
- authentication
- CORS
- API origins

Neprováděj DNS cutover bez předchozího staging testu.

Výslednou konfiguraci zdokumentuj bez citlivých údajů.

---

# 22. SECURITY

Povinně:

- žádné R2 secrets v client bundle
- žádné secrets v Git
- žádné secrets v logs
- private R2 bucket
- short-lived presigned URLs
- kontrola ownershipu souboru
- validace storage key
- ochrana proti přístupu k cizím `userId`
- kontrola MIME type
- kontrola velikosti
- kontrola uploadovaných souborů

Bezpečnostní rozhodnutí a jejich důvod dokumentuj.

---

# 23. TESTY

Po každé významné fázi:

```text
pnpm test
pnpm build
```

Podle potřeby:

```text
pnpm exec playwright test
```

Přidej regresní testy.

Neodstraňuj existující testy pouze proto, aby build prošel.

Výsledky testů zapisuj do migračního statusu.

---

# 24. POVINNÁ REGRESE

Po migraci musí být ověřeno:

```text
Login
Dashboard
Receipt list
Photo upload
PDF upload
Image compression
OCR
Import
Multiple products
Pending approval
Product Profile
Reimport
Preview
Download
Delete
Neon DB
Mobile upload
```

A zejména:

```text
large photo
small photo
PDF
multiple products
pending approval
reimport
```

Každý nalezený regresní problém musí být:

1. zaznamenán
2. opraven
3. znovu otestován
4. zapsán do dokumentace

---

# 25. VERCEL ODSTRANIT AŽ NAKONEC

Nesmíš předčasně odstranit:

```text
@vercel/blob
```

ani další Vercel dependencies.

Odstranění je možné až po potvrzení:

```text
All new uploads → R2
All old files → accessible
OCR → working
Import → working
Reimport → working
Preview → working
Delete → working
Cloudflare staging → working
Cloudflare production → working
Rollback → verified
```

Teprve potom:

```text
Vercel-specific code
↓
remove
```

Každé odstranění Vercel dependency musí být zaznamenáno v dokumentaci.

---

# 26. FINÁLNÍ CÍLOVÝ STAV

Cílem je:

```text
Cloudflare
├── Application
├── Workers/runtime
├── R2
├── Security
├── DNS
└── Deployment

Neon
└── PostgreSQL
```

Bez produkční závislosti na Vercelu.

---

# 27. GIT STRATEGIE

Pracuj po malých logických commitech.

Doporučené pořadí:

```text
1. audit
2. storage abstraction
3. R2 integration
4. upload migration
5. OCR integration
6. backward compatibility
7. tests
8. migration scripts
9. Cloudflare staging
10. Cloudflare deployment
11. production cutover
12. Vercel cleanup
```

Po každé zásadní fázi:

```text
pnpm test
pnpm build
```

Pokud něco selže, oprav to před pokračováním.

**Dokumentační změny musí být součástí příslušného logického commitu.**

---

# 28. ZÁKAZ NEPLÁNOVANÝCH REGRESÍ

Při každé změně se přesvědč:

> Nezměnil jsem něco, co používá jiná část aplikace?

Zvláštní pozornost věnuj:

```text
OCR
upload
compression
Base64
API
database
authentication
import
reimport
pending approval
mobile
```

Pokud najdeš existující bug nesouvisející s migrací, nejdříve ho zdokumentuj.

Neměň nesouvisející funkcionalitu bez důvodu.

---

# 29. FINÁLNÍ REPORT

Na konci vytvoř:

```text
docs/cloudflare-migration-status.md
```

Musí obsahovat:

```text
CLOUDFLARE SETUP
CURRENT STATE
VERCEL DEPENDENCIES
CLOUDFLARE REPLACEMENTS
CHANGED FILES
NEW FILES
DATABASE CHANGES
NEW ENV VARIABLES
R2 BUCKETS
UPLOAD FLOW
OCR FLOW
BACKWARD COMPATIBILITY
TESTS
BUILD
SECURITY
STAGING STATUS
PRODUCTION STATUS
ROLLBACK STATUS
MIGRATION STATUS
REMAINING VERCEL USAGE
KNOWN RISKS
NEXT STEP
```

Status musí vždy odpovídat skutečnému stavu projektu.

---

# 30. PRŮBĚŽNÁ AKTUALIZACE DOKUMENTACE – POVINNÁ KONTROLA

Před označením každé fáze jako dokončené zkontroluj:

```text
[ ] změny jsou zapsané v dokumentaci
[ ] dokumentace odpovídá skutečnému stavu
[ ] jsou zaznamenány změněné soubory
[ ] jsou zaznamenány nové environment variables
[ ] jsou zaznamenány DB změny
[ ] jsou zaznamenány Cloudflare resources
[ ] jsou zaznamenány testy
[ ] je zaznamenán build
[ ] jsou zaznamenána rizika
[ ] je popsán rollback
[ ] je uveden další krok
```

Pokud některá položka není splněna, fáze není dokončena.

---

# 31. ABSOLUTNÍ PRIORITA

Pokud během práce vznikne konflikt mezi:

```text
rychlostí migrace
```

a:

```text
bezpečností dat
stabilitou aplikace
zpětnou kompatibilitou
```

vždy má přednost:

```text
stabilita
+
bezpečnost
+
data
+
rollback
```

Nikdy neobětuj produkční stabilitu kvůli rychlejšímu dokončení migrace.

---

# 32. KRITICKÉ POŘADÍ

Dodrž přesně:

```text
1. Cloudflare Agent Setup
        ↓
2. Complete Vercel audit
        ↓
3. Migration architecture
        ↓
4. Storage abstraction
        ↓
5. R2
        ↓
6. Backward compatibility
        ↓
7. Tests
        ↓
8. Cloudflare staging
        ↓
9. Full regression
        ↓
10. Cloudflare production
        ↓
11. Production cutover
        ↓
12. Rollback verification
        ↓
13. Vercel dependency removal
        ↓
14. Final verification
```

**Nespouštěj další fázi, pokud předchozí fáze není ověřená a zdokumentovaná.**

---

# 33. HLAVNÍ CÍL

Na konci musí Shopping_Buddy fungovat jako plnohodnotná Cloudflare aplikace bez produkční závislosti na Vercelu.

Uživatelé během migrace nesmí být nuceni aplikaci přestat používat.

**Priorita č. 1: bezpečná kompletní migrace Shopping_Buddy z Vercelu na Cloudflare bez plánované odstávky a bez ztráty dat nebo funkcionality.**

**Každá významná změna musí být průběžně a přesně zaznamenána v projektové dokumentaci.**
