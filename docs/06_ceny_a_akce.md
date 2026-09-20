# FAMILY SHOPPING ASSISTANT — ČÁST 6
## Ceny a akce

> **Stav: HOTOVO.** `lib/prices.ts` definuje pro produkty běžnou cenu, akční cenu s datem platnosti, obchod, historickou cenu a cenu za jednotku (Kč/kg, Kč/l, Kč/ks) napříč obchody — přesně podle příkladu z tohoto promptu (Mléko 1 l v 5 obchodech). `PriceComparison` (`components/shopping/price-comparison.tsx`) zobrazí v detailu položky nákupního seznamu porovnání cen seřazené od nejlevnější, aktivní akce a rozpětí ceny za poslední 3 měsíce. Sekce „Akce pro váš seznam" na dashboardu (`price-watch.tsx`) nyní čerpá reálně z `activeDeals()`, které filtruje jen časově platné akce k danému referenčnímu datu. Mock data lze později nahradit skutečným zdrojem beze změny API funkcí.

### Cíl
Vytvořit systém pro porovnávání cen produktů mezi obchody.

### Produkt
Pro každý produkt připravit možnost evidovat:
- běžnou cenu
- akční cenu
- datum platnosti
- obchod
- historickou cenu
- cenu za jednotku

### Porovnávání
Příklad:
Mléko 1 l:
Lidl 24,90 Kč
Albert 29,90 Kč
Kaufland 25,90 Kč
Billa 31,90 Kč
Penny 26,90 Kč

### Jednotkové ceny
Systém musí umět porovnávat:
- Kč/kg
- Kč/l
- Kč/ks
- případně jiné relevantní jednotky

### Zásada
Cena musí být časově platná a svázaná s konkrétním obchodem a produktem. Později musí být možné nahradit mock data skutečnými zdroji.
