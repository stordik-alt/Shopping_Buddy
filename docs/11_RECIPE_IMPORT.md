# Import receptů do ANITKY

## Co přidává tato vrstva

Import receptů je oddělený od runtime vyhledávání. Stávající adaptéry portálů zůstávají zdrojem pravdy pro URL a parsování Schema.org Recipe JSON-LD.

Nově vzniká:
- společný globální katalog recipe_catalog,
- deduplikace podle canonical_url,
- importní běh pro každý ze čtyř současných portálů,
- volitelná kopie obrázku do Cloudflare R2,
- interní route pro bezpečné zobrazení uložených obrázků.

## Spouštěče

- pnpm db:recipes:recepty-cz
- pnpm db:recipes:apetit
- pnpm db:recipes:toprecepty
- pnpm db:recipes:vareni

Všechny používají jeden lib/recipes/importer.ts, aby se mezi portály neduplikovala databázová logika, deduplikace, image pipeline, limity a bezpečnost.

## Důležité: není to skrytý full-site crawler

Aktuální adaptéry používají search stránku a jejich vlastní omezený počet odkazů. Toprecepty má navíc záložní discovery přes aktuální katalogový výpis (vsechny_recepty.php), protože starší search endpoint může vrátit HTML bez receptových odkazů. Vaření.cz má záložní discovery přes RSS feed /rss/recepty.xml, protože vyhledávací endpoint může vracet HTTP 404. Proto importer vyžaduje explicitní --query a --limit.

Příklad:

pnpm db:recipes:recepty-cz -- --query "kuře" --query "rýže" --limit=40 --dry-run --acknowledge-source-terms

Po ověření dry-runu lze spustit zápis:

pnpm db:recipes:recepty-cz -- --query "kuře" --query "rýže" --limit=40 --acknowledge-source-terms

Opakovaný běh je idempotentní: stejný canonical URL aktualizuje existující řádek.

## Obrázky

Kopie obrázků je explicitně vypnutá, dokud operátor nenastaví RECIPE_IMPORT_IMAGE_COPY_ALLOWED=true.

Pro import obrázků je současně nutné:
- STORAGE_PROVIDER=r2,
- přepínač --images,
- případné CDN hostname přidat pomocí --image-host=host.example.

Příklad:

STORAGE_PROVIDER=r2 RECIPE_IMPORT_IMAGE_COPY_ALLOWED=true pnpm db:recipes:recepty-cz -- --query "kuře" --limit=20 --images --acknowledge-source-terms

Obrázek se přes Sharp převede na WebP, maximálně 1600 × 1600 px, a uloží se pod recipe-images/<source>/<sha256>.webp.

Do DB se ukládá source_image_url i image_ref. image_url ukazuje na interní route /api/recipes/images/{id}, pokud existuje R2 kopie.

## Právní a provozní hranice

Import receptových metadat a kopírování fotografií jsou dvě oddělené věci. Před produkčním použitím musí být pro každý portál ověřeny aktuální podmínky automatizovaného přístupu a právo na uložení fotografií.

Apetit Online má v aktuálních podmínkách výslovný zákaz automatizovaných nástrojů, skriptů a technologií pro procházení, sběr nebo indexaci obsahu bez předchozího písemného souhlasu. Proto je Apetit importer navíc zablokovaný, dokud není nastaveno RECIPE_IMPORT_APETIT_WRITTEN_PERMISSION=true.

U ostatních portálů tato implementace nepředpokládá udělení licence jen tím, že stránka je veřejně dostupná. Pokud se později zjistí omezení automatizovaného přístupu nebo zvláštní licenční podmínky, wrapper musí zůstat vypnutý nebo dostat vlastní explicitní policy.

## Co zatím importer neumí

Neobsahuje režim --all pro kompletní katalog každého portálu. To musí být navrženo po jednom portálu na základě skutečně dostupného a povoleného discovery mechanismu, například sitemap, kategorií nebo stránkování.

Stejně tak importer nekopíruje text postupu přípravy. Receptová data obsahují jen metadata a strukturovaný seznam ingrediencí, v souladu s docs/10_RECIPES.md.

## Bezpečnost

- zdroj receptu musí být HTTPS a prochází existujícím domain allowlistem,
- URL obrázku má vlastní host allowlist a blokaci private IP,
- odpověď obrázku má limit 8 MB,
- timeout obrázku je 10 sekund,
- maximálně dva redirecty a každý musí zůstat v allowlistu,
- importer předává zdrojům pouze vlastní Accept hlavičky, nikoli cookies přihlášeného uživatele,
- import běží sekvenčně s nastavitelným delay-ms.

## Budoucí rozšíření

Až bude pro konkrétní portál ověřený full discovery mechanismus, může jeho wrapper dostat vlastní cursor/checkpoint režim bez změny databázového modelu.