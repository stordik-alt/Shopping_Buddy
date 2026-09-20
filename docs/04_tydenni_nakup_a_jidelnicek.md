# FAMILY SHOPPING ASSISTANT — ČÁST 4
## Týdenní plán nákupu a jídel

> **Stav: HOTOVO.** `lib/meal-plans.ts` obsahuje databázi receptů (snídaně/oběd/večeře/svačina) s cenou a alergeny a funkci `generateWeeklyPlan`, která podle zadaného rozpočtu a preferencí/alergií domácnosti (`lib/mock-data.ts`) sestaví jídelníček na 7 dní včetně základních domácích potřeb, odhadu ceny a doporučených obchodů. `components/dashboard/meal-plan.tsx` umožňuje zadat rozpočet (např. „do 2 500 Kč"), zobrazí vygenerovaný týdenní jídelníček a tlačítkem převede sloučené (deduplikované) ingredience na položky nákupního seznamu (`planIngredients`). Napojení na skutečné ceny a obchody je připraveno pro promptu 06.

### Cíl
Umožnit vytvořit jídelní plán a z něj automaticky vytvořit nákupní seznam.

### Zadání uživatele
Například:
„Naplánuj nám nákup na příští týden do 2 500 Kč.“

### Výstup
- snídaně
- obědy
- večeře
- svačiny
- základní domácí potřeby
- nákupní seznam
- odhad ceny
- doporučené obchody

### Jídelníček
Pro každý den:
- snídaně
- oběd
- večeře
- případně svačina

### Generování seznamu
Ingredience a potřebné produkty se převedou do nákupních položek, sloučí se duplicity a zohlední se preference domácnosti.

### Budoucí optimalizace
Nákupní seznam → ceny → akce → rozpočet → optimalizovaný nákup.
