# Návrh datového modelu akcí a podmínek nákupu

**Stav: návrh k revizi, bez změny databázového schématu a bez produkčních zápisů.**  
**Cíl:** uchovávat podmínky akcí jako strojově vyhodnotitelná pravidla, aby ANITKA uměla správně zobrazit podmínky, přepočítat nákupní seznam a nepřisuzovala uživateli slevu, na kterou nemá nárok.

## 1. Základní princip

Běžná cena, akční cena, klubová cena a množstevní sleva jsou odlišné cenové skutečnosti. Nesmí se slít do jediné hodnoty `price`.

Existující `deals` obsahuje cenu a platnost, ale neumí úplně popsat společnou akci pro více výrobků, podmínku členství, pravidlo „nejlevnější zdarma“ ani počet kusů, které se musí koupit. Návrh proto přidává samostatnou entitu akce a její podmínky. Stávající `deals` zůstane během přechodu kompatibilní vrstvou pro jednoduché, bezpodmínečné cenové nabídky.

## 2. Navržené tabulky

### 2.1 `promotions` — hlavička akce

- `id` UUID.
- `source` — řetězec/zdroj nabídky.
- `store_id` FK, povinný; `store_location_id` volitelný pro konkrétní pobočku.
- `source_promotion_id` text, volitelný stabilní identifikátor akce ze zdroje.
- `title` text, `description` text.
- `promotion_type` — `simple_discount`, `multi_buy`, `buy_x_get_y`, `cheapest_free`, `basket_discount`, `loyalty_price`, `brand_assortment`.
- `status` — `active`, `expired`, `paused`, `needs_review`.
- `valid_from`, `valid_until` nullable jen pokud zdroj platnost neuvádí.
- `scope` — `chain`, `store_format`, `region`, `store`, `online`.
- `source_url`, `observed_at`, `confidence`, `verification_status`.
- `created_at`, `updated_at`.

Neznámá platnost se nesmí nahrazovat vymyšleným datem. Nabídka bez doložené platnosti může být zobrazena jako neověřená/platnost neuvedena, ale nesmí se bez dalšího považovat za aktuální.

### 2.2 `promotion_rules` — podmínky a výpočet

Jedna akce může mít jednu nebo více pravidel. Každé pravidlo má typ, parametry a výslovně definovanou oblast započítávání.

- `id` UUID.
- `promotion_id` FK.
- `rule_type` — `minimum_quantity`, `buy_x_get_y`, `unit_price_override`, `percent_discount`, `fixed_discount`, `cheapest_free`, `basket_threshold`, `loyalty_membership`.
- `required_quantity` integer/numeric, nullable podle typu.
- `reward_quantity` integer/numeric, nullable podle typu.
- `discount_value` numeric, nullable podle typu.
- `discount_unit` — `currency`, `percent`, `unit_price`, nullable podle typu.
- `max_applications` integer, nullable = bez limitu jen tehdy, pokud to zdroj potvrzuje.
- `stacking_policy` — zda lze kombinovat s jinou akcí; výchozí `unknown`, pokud podmínky nejsou doloženy.
- `rule_parameters` JSONB pro dodatečné typově validované parametry, nikoli jako jediný zdroj pravdy pro běžné povinné hodnoty.
- `evaluation_status` — `verified`, `inferred_needs_review`, `unsupported`.

Validace musí vyžadovat pole podle `rule_type`. Například `buy_x_get_y` vyžaduje kladné X a Y; procentní sleva vyžaduje hodnotu v povoleném rozsahu. Neznámý typ pravidla se nesmí tiše ignorovat.

### 2.3 `promotion_eligible_items` — rozsah produktů akce

- `promotion_id` FK.
- `product_id` nebo cílově `trade_item_id` FK.
- `eligibility_role` — `qualifying`, `reward`, `excluded`.
- `source_reference` / důkaz původu vazby.
- `confidence`, `verification_status`.

Unikátní vazba pro dvojici akce a identifikované položky. Při akci na značku nebo sortiment musí být explicitně evidováno, které produkty se započítávají. Pouhé sdílení značky není důkazem, že výrobek do akce patří.

### 2.4 `promotion_membership_requirements` — klubové podmínky (volitelná podtabulka)

Pokud je potřeba více typů členství nebo doložení podmínek, uchová:

- `promotion_id` FK.
- `membership_program` — např. `Teta Klub`.
- `requirement_type` — `membership_required`, `app_coupon_required`, `activation_required`, `unknown`.
- `requirement_text`, `verification_status`.

U jednoduchého případu může být členství reprezentováno pravidlem `loyalty_membership`; samostatná tabulka je vhodná až tehdy, pokud zdroj obsahuje více podmínek nebo potřebujeme ověřovat jejich splnění pro konkrétního uživatele.

### 2.5 `promotion_price_effects` — cenový efekt

Aby se podmínka oddělila od výsledku, musí být znám mechanismus odměny:

- `promotion_id` FK.
- `effect_type` — `fixed_unit_price`, `percent_off`, `amount_off`, `free_quantity`, `cheapest_item_free`, `basket_amount_off`, `basket_percent_off`.
- `value` numeric.
- `currency` u peněžní hodnoty.
- `applies_to` — `qualifying_items`, `reward_items`, `cheapest_eligible_item`, `basket`.
- `max_applications` nullable.
- `rounding_policy` definovaná pro měnu, v CZK se počítá s přesností na haléře.

Pokud akce udává pouze výslednou cenu za kus při splnění podmínky, uložení má obsahovat tuto cenu přímo. Výpočet se nesmí pokoušet odvodit slevu z nesouvisející běžné ceny.

## 3. Podpora klíčových typů akcí

| Typ akce | Povinné informace | Výpočet |
|---|---|---|
| Sleva na jednotku | cena před/po slevě nebo doložená sleva | počet způsobilých kusů × výsledná cena |
| Kup alespoň N kusů stejného výrobku | minimum, způsobilý trade item, výsledná cena/sleva | sleva až po dosažení minima |
| Kup N kusů z vybraného sortimentu/značky | seznam způsobilých položek, společné minimum | počítat kusy napříč způsobilými položkami |
| Kup X, získej Y | X, Y, jak se vybírá odměna a její cena | podle doloženého pravidla; ne předpokládat, že je odměna zdarma |
| Nejlevnější kus zdarma | způsobilé položky, požadované množství, limit opakování | bezplatný je nejlevnější způsobilý kus podle podmínek |
| Klubová cena | cena pro členy a podmínka členství/aktivace | klubová cena jen pokud uživatel potvrdí příslušnou podmínku |
| Sleva z košíku | práh košíku, rozsah způsobilých položek, sleva | vyhodnotit až nad způsobilým součtem košíku |

## 4. Výpočet nákupního seznamu

Výpočet musí být deterministická čistá funkce bez síťových požadavků:

1. Načíst množství uživatelem zadaných položek a aktuální cenové záznamy.
2. Vyřadit akce mimo doloženou platnost nebo s nedostatečně ověřenými pravidly.
3. Zjistit, které položky akce opravňuje započítat; u značkové akce se nesmí počítat celý sortiment značky bez seznamu/ověřeného rozsahu.
4. Spočítat kvalifikační množství podle pravidla: stejný výrobek, konkrétní balení nebo společný sortiment.
5. Vypočítat cenu položek, slevu, počet použití akce a součet nákupního seznamu.
6. Aktualizovat úsporu a rozpočet.
7. Zobrazit podmínku a rozdíl mezi běžnou cenou a cenou po splnění podmínky.

Změna množství v seznamu přepočítá celou dotčenou akci, ne jen řádek, protože kusy z různých položek mohou společně splnit jednu podmínku.

### UX pravidla

- Nikdy automaticky nezvyšovat uživatelem zadané množství.
- Pokud jeden další kus splní podmínku, zobrazit návrh „Přidejte 1 kus a splníte podmínku akce“ s rozdílem v ceně; uživatel musí potvrdit.
- Zobrazit počet potřebných kusů, okruh způsobilých výrobků, klubovou podmínku a platnost.
- U neověřených podmínek zobrazit vysvětlení a běžnou cenu; nepočítat neověřenou slevu jako jistou úsporu.
- Rozpočet má odrážet aktuální vypočtený nákupní součet a jasně rozlišovat jistou cenu od podmíněné/odhadované.

## 5. Zdrojová evidence a důvěra

Každá akce musí zachovat:
- zdroj a URL,
- okamžik načtení,
- surový text podmínky,
- normalizovanou strukturu pravidla,
- stav ověření a důvod případné kontroly,
- interval platnosti, pokud je zdroj zveřejňuje.

Parser nesmí odvozovat „kup 2“ jen z textu „2+1 zdarma“ jinde na stránce. Podmínka musí být propojena s konkrétní cenou nebo konkrétní akcí. Klubová cena je samostatná od množstevní akce.

## 6. Integrace se stávajícím modelem

- `deals` zůstane kompatibilní pro jednoduché akce s doloženou platností.
- `promotions` a související tabulky budou zdrojem pravdy pro podmíněné, klubové a víceproduktové akce.
- Během přechodu nesmí být stejná akce započítána zároveň přes `deals` i `promotions`.
- Akce se může nově navázat přes volitelné `deals.trade_item_id` nebo `deals.retailer_product_ref_id`; kompozitní FK zajišťuje shodu s `product_id`. Existující akce zůstávají na produktové úrovni, dokud není jejich identita bezpečně potvrzena. Vazba na obchodní jednotku nebo jednoznačnou retailer reference má přednost před pouhým názvem.
- Výpočty ceny a slevy mají být testovány na hranicích: těsně pod minimem, přesně na minimu, násobcích minima, smíšeném sortimentu, omezení použití a expiraci.
- Uživatelův souhlas s členstvím/aktivací je samostatný vstup do výpočtu; aplikace nemůže předpokládat, že je uživatel členem nebo kupón aktivoval.

## 7. Migrační pořadí

1. Přidat nové tabulky a validace bez změny chování produkčního výpočtu.
2. Převést pouze akce, jejichž podmínky jsou doložené a jednoznačně interpretované.
3. Přidat čistou funkci pro výpočet nároku a cenového efektu s jednotkovými testy.
4. Integrovat výsledek do nákupního seznamu, celkového součtu a rozpočtu.
5. Přidat parser Tety a regresní testy na skutečných HTML vzorcích.
6. Po ověření parity zapnout vyhodnocování v produkci postupně.

## 8. Kritéria přijetí

- Aplikace ukazuje podmínky a přesně identifikuje způsobilé položky.
- Smíšený sortiment se počítá jen tehdy, pokud jej zdroj výslovně zahrnuje.
- Cena, úspora, celkový nákupní součet a rozpočet se přepočítají při změně množství.
- Neověřená pravidla nevedou k falešně deklarované slevě.
- Klubová cena, vícekusová akce a běžná sleva jsou oddělené typy.
- Žádná akce nemění množství bez souhlasu uživatele.
- Opakovaný import je idempotentní a nezakládá duplicitní akce.
