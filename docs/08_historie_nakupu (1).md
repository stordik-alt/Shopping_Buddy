# FAMILY SHOPPING ASSISTANT — ČÁST 8
## Historie nákupů

> **Stav: HOTOVO.** Typ `PurchaseRecord` (`lib/types.ts`) ukládá datum, obchod, produkty s množstvím a cenou, celkovou částku a případnou slevu. `lib/purchase-history.ts` počítá běžnou měsíční útratu, nejčastěji kupované produkty, oblíbené obchody a opakované nákupy — základ pro budoucí AI kontext. `components/budget/purchase-history.tsx` zobrazuje tyto statistiky a rozbalovací seznam uskutečněných nákupů v Rozpočet tabu.

### Cíl
Ukládat uskutečněné nákupy tak, aby z nich bylo možné vytvářet dlouhodobé statistiky.

### Záznam nákupu
- datum
- obchod
- produkty
- množství
- cena
- celková částka
- případná sleva

### Budoucí analýza
- běžná měsíční útrata
- nejčastěji kupované produkty
- vývoj cen
- změny nákupních návyků
- oblíbené obchody
- opakované nákupy

### Budoucí AI
Historie bude součástí kontextu AI, aby mohla pracovat s reálnými nákupními návyky domácnosti.
