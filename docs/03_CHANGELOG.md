## 2026-10-09 — Ověření CI a bezpečnostní hranice Product Subtype
- CI pro PR #397 úspěšně dokončilo unit testy/typecheck/production build, databázové testy nad lokálním PostgreSQL, Playwright smoke testy a Cloudflare Worker build bez deploye; bezpečnostní audit závislostí a CodeQL také prošly.
- Ingest DRY RUN [37914167628](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37914167628) na commitu `fae9f2f` úspěšně zpracoval 24 vstupů, 24 deduplikovaných kandidátů a 0 chyb. Všech 24 mělo stav `would_insert_or_merge`; nebyl proveden databázový zápis.
- Regresní testy priorit zůstávají specifikací politiky založenou na syntetických signálech, nikoli produkčním klasifikátorem. Přidán test skutečné funkce `buildProductSubtypeMappings`, který ověřuje, že nový návrh „Světlé pivo“ zůstává mimo produkční registr a nevytvoří přiřazení.
- Samostatný resolver priorit pro textové důkazy u 24 rozšiřujících návrhů zatím v produkční logice neexistuje; před automatickým přiřazováním je nutné jej navrhnout jako sdílenou, testovatelnou logiku a vyhodnotit proti reálnému katalogu v read-only režimu.
- Žádné schválení návrhů, databázové zápisy ani přiřazování produktů.

## 2026-10-09 — Zpřesnění hranic kandidátů Product Subtype
- Upraveno všech 24 návrhů v `docs/examples/product-subtype-registry-expansion-candidates.json`: explicitní důkaz, vzájemné výluky a zacházení s nejednoznačnými produkty.
- Doplněna rozhodovací priorita pro těstoviny, rýži a tavený sýr; u tvarohu se zakazuje odvozovat tučnost bez ověřené specifikace; u piva a tuňáka rozhoduje výslovné označení.
- Doplněn revizní dokument a obecná pravidla hranic/preference do `docs/12_PRODUCT_TYPES.md`.
- Původní ingest DRY RUN [37912495113](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37912495113) proběhl před poslední úpravou; následný DRY RUN [37913251670](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37913251670) na commitu PR #396 potvrdil 24 vstupů, 24 deduplikovaných kandidátů a 0 chyb.
- PR #396 byl sloučen; návrhy zůstávají věcně neschválené a nebyly zapsány do databáze. Neprovádět `--apply` bez samostatného rozhodnutí.

## 2026-10-09 — Automatické testy priorit a překryvů Product Subtype
- Přidán `lib/product-subtype-candidate-precedence.test.ts` s regresními testy priorit těstovin a rýže, konfliktních signálů, explicitních důkazů a hranic piva, tvarohu, tavených sýrů a tuňáka.
- Testy ověřují přítomnost a jedinečnost 24 návrhů v kandidátním JSON. Syntetické testy dokumentují zamýšlenou politiku; samy o sobě netestují produkční klasifikaci těchto návrhů.
- PR #397 byl sloučen. CI run [37913741324](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37913741324) prošel; bezpečnostní audit [37913741220](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37913741220) také prošel.
- Bez databázových zápisů, schvalování poddruhů nebo přiřazování produktů.

{
  "candidates": [
    {
      "parentTypeKey": "pivo",
      "name": "Světlé pivo",
      "definition": "Pivo, jehož deklarovaná barva je světlá.",
      "includes": [
        "výrobek je výrobcem nebo etiketou označen jako světlé pivo"
      ],
      "excludes": [
        "výslovně označené tmavé nebo polotmavé pivo"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Pivo",
        "productCount": 609,
        "sampleProducts": [
          "Bakalář Rakovnický ležák za studena chmelený 0,5l",
          "Velkopopovický Kozel Černý pivo výčepní tmavé 0,5l",
          "Stella Artois světlý ležák, sklo"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "pivo",
      "name": "Polotmavé pivo",
      "definition": "Pivo výslovně označené jako polotmavé.",
      "includes": [
        "výrobek je výrobcem nebo etiketou označen jako polotmavé pivo"
      ],
      "excludes": [
        "výslovně označené světlé nebo tmavé pivo"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Pivo",
        "productCount": 609,
        "sampleProducts": [
          "Bakalář Rakovnický ležák za studena chmelený 0,5l",
          "Velkopopovický Kozel Černý pivo výčepní tmavé 0,5l",
          "Stella Artois světlý ležák, sklo"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "pivo",
      "name": "Tmavé pivo",
      "definition": "Pivo výslovně označené jako tmavé.",
      "includes": [
        "výrobek je výrobcem nebo etiketou označen jako tmavé pivo"
      ],
      "excludes": [
        "výslovně označené světlé nebo polotmavé pivo"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Pivo",
        "productCount": 609,
        "sampleProducts": [
          "Bakalář Rakovnický ležák za studena chmelený 0,5l",
          "Velkopopovický Kozel Černý pivo výčepní tmavé 0,5l",
          "Stella Artois světlý ležák, sklo"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "testoviny",
      "name": "Dlouhé těstoviny",
      "definition": "Těstoviny prodávané v dlouhých pramenech nebo tyčích.",
      "includes": [
        "špagety, linguine a obdobné dlouhé tvary"
      ],
      "excludes": [
        "pláty na lasagne, plněné těstoviny a drobné polévkové tvary"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Těstoviny",
        "productCount": 419,
        "sampleProducts": [
          "Sam Mills Kukuřično-rýžové těstoviny - Vřetena bez lepku",
          "Kitchin Fusilli N. 260 Bronze",
          "Cornito Bezlepkové těstoviny fleky"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "testoviny",
      "name": "Krátké tvarované těstoviny",
      "definition": "Neplněné krátké těstovinové tvary určené jako hlavní příloha nebo do salátů.",
      "includes": [
        "penne, fusilli, farfalle a podobné krátké tvary"
      ],
      "excludes": [
        "dlouhé těstoviny, plněné těstoviny, pláty na lasagne a drobné polévkové těstoviny"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Těstoviny",
        "productCount": 419,
        "sampleProducts": [
          "Sam Mills Kukuřično-rýžové těstoviny - Vřetena bez lepku",
          "Kitchin Fusilli N. 260 Bronze",
          "Cornito Bezlepkové těstoviny fleky"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "testoviny",
      "name": "Polévkové těstoviny",
      "definition": "Drobné těstovinové tvary primárně určené do polévek.",
      "includes": [
        "písmenka, drobné nudle a drobné polévkové tvary"
      ],
      "excludes": [
        "dlouhé těstoviny, krátké přílohové tvary, plněné těstoviny a pláty na lasagne"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Těstoviny",
        "productCount": 419,
        "sampleProducts": [
          "Sam Mills Kukuřično-rýžové těstoviny - Vřetena bez lepku",
          "Kitchin Fusilli N. 260 Bronze",
          "Cornito Bezlepkové těstoviny fleky"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "testoviny",
      "name": "Plněné těstoviny",
      "definition": "Těstoviny, jejichž součástí je náplň.",
      "includes": [
        "ravioli, tortellini a podobné plněné tvary"
      ],
      "excludes": [
        "neplněné těstoviny a pláty na lasagne bez náplně"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Těstoviny",
        "productCount": 419,
        "sampleProducts": [
          "Sam Mills Kukuřično-rýžové těstoviny - Vřetena bez lepku",
          "Kitchin Fusilli N. 260 Bronze",
          "Cornito Bezlepkové těstoviny fleky"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "testoviny",
      "name": "Pláty na lasagne",
      "definition": "Těstovinové pláty určené pro vrstvené pokrmy typu lasagne.",
      "includes": [
        "pláty prodávané jako lasagne"
      ],
      "excludes": [
        "nudle a jiné dlouhé/krátké tvary; hotové lasagne jako připravené jídlo"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Těstoviny",
        "productCount": 419,
        "sampleProducts": [
          "Sam Mills Kukuřično-rýžové těstoviny - Vřetena bez lepku",
          "Kitchin Fusilli N. 260 Bronze",
          "Cornito Bezlepkové těstoviny fleky"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Rýže basmati",
      "definition": "Rýže výslovně deklarovaná jako odrůda basmati.",
      "includes": [
        "balení označené basmati"
      ],
      "excludes": [
        "jasmínová, arborio a jiné výslovně pojmenované odrůdy"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Rýže jasmínová",
      "definition": "Rýže výslovně deklarovaná jako jasmínová.",
      "includes": [
        "balení označené jasmínová nebo jasmine rice"
      ],
      "excludes": [
        "basmati, arborio a jiné výslovně pojmenované odrůdy"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Rýže arborio a na rizoto",
      "definition": "Rýže odrůdy arborio nebo výslovně určená na rizoto.",
      "includes": [
        "arborio a výrobky označené jako rýže na rizoto"
      ],
      "excludes": [
        "basmati, jasmínová a běžná rýže bez určení na rizoto"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Rýže parboiled",
      "definition": "Rýže, u níž je na obalu deklarována úprava parboiled.",
      "includes": [
        "výrobky výslovně označené parboiled"
      ],
      "excludes": [
        "rýže bez deklarace parboiled; odrůda basmati/jasmínová má přednost, pokud je potřeba zachovat jediný subtype"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Rýže natural / celozrnná",
      "definition": "Rýže prodávaná jako natural, celozrnná nebo hnědá rýže.",
      "includes": [
        "výrobky výslovně označené natural, celozrnná nebo brown rice"
      ],
      "excludes": [
        "bílá/loupaná rýže a výrobky s jinou dominantní výslovnou odrůdou"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Ostatní dlouhozrnná rýže",
      "definition": "Dlouhozrnná rýže bez konkrétního názvu odrůdy a bez jiné zvláštní úpravy.",
      "includes": [
        "výslovně dlouhozrnná bílá rýže, která není basmati, jasmínová ani parboiled"
      ],
      "excludes": [
        "basmati, jasmínová, parboiled, natural/celozrnná a kulatozrnná rýže"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "ryze",
      "name": "Ostatní kulatozrnná rýže",
      "definition": "Kulatozrnná rýže bez konkrétní odrůdy a bez jiné zvláštní úpravy.",
      "includes": [
        "výslovně kulatozrnná bílá rýže, která není arborio ani parboiled"
      ],
      "excludes": [
        "arborio/rýže na rizoto, parboiled, natural/celozrnná a dlouhozrnná rýže"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Rýže",
        "productCount": 246,
        "sampleProducts": [
          "Lagris Rýže Parboiled ve varných sáčcích",
          "Riso Scotti Vener Parboiled rýže",
          "Lagris Rýže kulatozrnná loupaná 1kg"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "tvaroh",
      "name": "Tučný tvaroh",
      "definition": "Tvaroh deklarovaný výrobcem jako tučný nebo odpovídající explicitnímu údaji o tuku.",
      "includes": [
        "etiketa nebo důvěryhodná produktová specifikace označuje tvaroh jako tučný"
      ],
      "excludes": [
        "výslovně polotučný nebo odtučněný tvaroh"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tvaroh",
        "productCount": 114,
        "sampleProducts": [
          "Tatra Tvaroh odtučněný",
          "Tatra Tvaroh tučný suš.22%",
          "Olma Olomoucký tvaroh odtučněný 250 g"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "tvaroh",
      "name": "Polotučný tvaroh",
      "definition": "Tvaroh deklarovaný výrobcem jako polotučný.",
      "includes": [
        "etiketa nebo důvěryhodná produktová specifikace označuje tvaroh jako polotučný"
      ],
      "excludes": [
        "výslovně tučný nebo odtučněný tvaroh"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tvaroh",
        "productCount": 114,
        "sampleProducts": [
          "Tatra Tvaroh odtučněný",
          "Tatra Tvaroh tučný suš.22%",
          "Olma Olomoucký tvaroh odtučněný 250 g"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "tvaroh",
      "name": "Odtučněný tvaroh",
      "definition": "Tvaroh deklarovaný výrobcem jako odtučněný nebo nízkotučný podle ověřeného označení.",
      "includes": [
        "etiketa nebo důvěryhodná produktová specifikace označuje tvaroh jako odtučněný"
      ],
      "excludes": [
        "výslovně tučný nebo polotučný tvaroh"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tvaroh",
        "productCount": 114,
        "sampleProducts": [
          "Tatra Tvaroh odtučněný",
          "Tatra Tvaroh tučný suš.22%",
          "Olma Olomoucký tvaroh odtučněný 250 g"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "taveny-syr",
      "name": "Plátkový tavený sýr",
      "definition": "Tavený sýr vyráběný a prodávaný jako jednotlivé plátky.",
      "includes": [
        "etiketa uvádí plátky nebo produkt tvoří oddělené plátky taveného sýra"
      ],
      "excludes": [
        "roztíratelný sýr v kelímku nebo tavený sýr v bloku/porcích"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tavený sýr",
        "productCount": 102,
        "sampleProducts": [
          "ARO Sýr tavený light 26%",
          "Metro Chef Sýr tavený 64%",
          "Moravia Jemný tavený máslový sýr"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "taveny-syr",
      "name": "Roztíratelný tavený sýr",
      "definition": "Tavený sýr určený k roztírání, typicky v kelímku nebo vaničce.",
      "includes": [
        "produkt je deklarován jako roztíratelný a prodává se ve společném kelímku/vaničce"
      ],
      "excludes": [
        "plátkový tavený sýr a pevné jednotlivé porce"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tavený sýr",
        "productCount": 102,
        "sampleProducts": [
          "ARO Sýr tavený light 26%",
          "Metro Chef Sýr tavený 64%",
          "Moravia Jemný tavený máslový sýr"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "taveny-syr",
      "name": "Porcovaný tavený sýr",
      "definition": "Tavený sýr prodávaný v samostatně zabalených porcích nebo trojúhelníčcích.",
      "includes": [
        "samostatné porce nebo trojúhelníčky taveného sýra"
      ],
      "excludes": [
        "roztíratelný sýr ve vaničce a volné plátky"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tavený sýr",
        "productCount": 102,
        "sampleProducts": [
          "ARO Sýr tavený light 26%",
          "Metro Chef Sýr tavený 64%",
          "Moravia Jemný tavený máslový sýr"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "tunak-konzerva",
      "name": "Tuňák ve vlastní šťávě",
      "definition": "Konzervovaný tuňák, jehož nálev je označen jako vlastní šťáva.",
      "includes": [
        "výslovně označený tuňák ve vlastní šťávě"
      ],
      "excludes": [
        "tuňák v oleji nebo v jiném nálevu"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tuňák v konzervě",
        "productCount": 82,
        "sampleProducts": [
          "Rio Mare Tuňák ve vlastní šťávě",
          "Tuňák v olivovém oleji",
          "BILLA Tuňák ve vlastní šťávě 3 x 80g (240g)"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "tunak-konzerva",
      "name": "Tuňák v oleji",
      "definition": "Konzervovaný tuňák naložený v oleji.",
      "includes": [
        "etiketa uvádí olej jako konzervační nálev"
      ],
      "excludes": [
        "tuňák ve vlastní šťávě nebo ve vodním/jiném nálevu"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tuňák v konzervě",
        "productCount": 82,
        "sampleProducts": [
          "Rio Mare Tuňák ve vlastní šťávě",
          "Tuňák v olivovém oleji",
          "BILLA Tuňák ve vlastní šťávě 3 x 80g (240g)"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    },
    {
      "parentTypeKey": "tunak-konzerva",
      "name": "Tuňák ve vodním nálevu",
      "definition": "Konzervovaný tuňák v nálevu na bázi vody, který není označen jako vlastní šťáva.",
      "includes": [
        "etiketa uvádí vodu nebo vodní nálev"
      ],
      "excludes": [
        "tuňák v oleji a tuňák ve vlastní šťávě"
      ],
      "sourceType": "manual",
      "sourceName": "Product Subtype registry expansion review — read-only audit 37910630603",
      "sourceVersion": "github-actions-run-37910630603",
      "sourceRecordIds": [],
      "evidence": {
        "auditRunId": 37910630603,
        "productTypeName": "Tuňák v konzervě",
        "productCount": 82,
        "sampleProducts": [
          "Rio Mare Tuňák ve vlastní šťávě",
          "Tuňák v olivovém oleji",
          "BILLA Tuňák ve vlastní šťávě 3 x 80g (240g)"
        ],
        "reviewStatus": "proposal_only_not_approved",
        "notes": "Derived from aggregate read-only inventory; sample products are context only, not evidence that all products fit this subtype."
      }
    }
  ]
}


## 2026-10-09 — Product Subtype evidence resolver implementation (PR review pending)

- Added the pure, deterministic `resolveProductSubtypeEvidence` interface and version `2026-10-v1` for the six reviewed expansion families. Evidence retains source, field, original value, matched rule and support/contradiction polarity.
- Implemented explicit evidence rules, deterministic family priorities, equal-priority conflict review, unsupported-type handling, and protection for existing subtype assignments. Missing evidence never creates a subtype proposal.
- Added regression tests for positive matches across all six families, insufficient evidence, conflict handling, priority overlaps, category boundaries, manufacturer-spec evidence, evidence provenance and determinism.
- Added the read-only catalog simulation command `pnpm db:simulate-product-subtype-expansion` and a manual GitHub Actions workflow using `NEON_PROD_DATABASE_URL`. The report counts all catalog rows and assignments, evaluates only the six target Product Types, includes decision/reason/subtype counts and evidence-backed product details, and documents source-data limits. Use `--details` to include all products in the six target families.
- Current product query has no standalone description, manufacturer-spec or verified-attribute join; the simulation therefore uses catalog name, brand and variant only. This limitation is reported rather than filled with guessed evidence.
- This implementation is not connected to runtime classification or import/seed flows. No database writes, product assignments, candidate approvals, active subtype creation, or production changes were performed. The 24 expansion candidates and embedded JSON catalog above remain unchanged and unapproved.


## 2026-10-09 — Product Subtype production simulation review

- Inspected successful read-only workflow run [37928914569](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37928914569), which processed all 1,572 products in the six expansion families from a production catalog of 55,842 products; it reported 910 matches, 6 conflicts requiring review and 656 products with insufficient explicit evidence.
- The report exposed overly broad processed-cheese wording that could classify ordinary Gouda slices as sliced processed cheese, and incomplete phrase coverage for tuna explicitly labelled as packed in olive oil. Tightened cheese patterns to require explicit processed-cheese wording with the product form, retained package counts as non-evidence, and added explicit oil wording variants.
- Added regression coverage for generic cheese-slice/pack-count false positives and common tuna-oil wording. This is a follow-up correction only; resolver output remains proposal-only.
- No production product assignments or subtype registry changes were made. The simulation itself performed no writes.


- CI for the simulation-driven correction exposed two regressions in tests: the word order `Tavený sýr plátkový` was not represented in the explicit sliced-cheese phrases, and removing standalone `porcovaný` broke the intended precedence when a product explicitly described both forms. Added the exact phrase and restored `porcovaný` as explicit form evidence; package count alone remains insufficient.

## 2026-10-09 — Post-fix Product Subtype simulation (run 37930358171)

- Re-ran the read-only simulation on `main` at commit `73f9e314c381c96ee089a7511f9d32760fc9d501` after merging the resolver evidence-boundary fixes. Run [37930358171](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37930358171) completed successfully and returned details for all 1,572 products in the six target families.
- Compared with run `37928914569`: matches increased from 910 to 919 (+9), conflicts/reviews increased from 6 to 7 (+1), and insufficient-evidence outcomes decreased from 656 to 646 (-10). Catalog totals remained 55,842 products, with 1,572 target-family products and zero existing subtype assignments in the target families (zero catalog-wide as reported).
- Validated intended changes in output: `Apetito Gouda plátky 90g` now returns `no_match / insufficient_evidence`, while `Rio Mare Tuňák v olivovém oleji 160g` now matches `tunak-konzerva-v-oleji`. This confirms the two main regression goals: generic cheese slices are not treated as sliced processed cheese, and explicit olive-oil wording is recognized.
- The new review/conflict is appropriate for a mixed-option product label; the seven conflicts include mixed quark fat classes, tuna labels listing alternatives such as oil/own juice, a mixed beer assortment and rice listing both basmati/jasmine. These remain review-only; no subtype is proposed for conflicting products.
- The output still misses the abbreviated tuna label `Rio Mare Tuňák v ol.oleji`; this is an evidence-coverage gap and should only be addressed with a specific regression test if we decide that this abbreviation is reliable enough.
- Simulation mode explicitly reports read-only behavior (no INSERT/UPDATE/DELETE or assignment changes). No product assignments were written, no candidate was approved, and all 24 proposed subtype candidates remain unapproved.


## 2026-10-09 — Regresní testy zkráceného označení tuňáka v oleji

- Navazuje na simulaci [37930358171](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37930358171), která potvrdila, že plný zápis `v olivovém oleji` funguje, ale katalogový název `Rio Mare Tuňák v ol.oleji` zůstává bez shody.
- Přidáváme pouze explicitní normalizovanou variantu `v ol oleji` odpovídající zkrácení `v ol.oleji`; žádné fuzzy domýšlení z pouhého slova „olivový“ nebo „olej“.
- Regresní testy pokryjí varianty interpunkce, očekávanou klasifikaci tuňáka v oleji a negativní případy pro nejednoznačné zmínky o oleji a jiné druhy zboží.
- Ověření PR #401: unit testy, typecheck, production build, databázové testy nad lokálním PostgreSQL, Playwright smoke testy, Cloudflare Worker build bez deploye, CodeQL a audit produkčních závislostí prošly. CI run [37936190944](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37936190944), security run [37936190917](https://github.com/stordik-alt/Shopping_Buddy/actions/runs/37936190917).
