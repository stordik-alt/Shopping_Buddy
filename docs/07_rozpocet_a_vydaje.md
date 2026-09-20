# FAMILY SHOPPING ASSISTANT — ČÁST 7
## Rozpočet a výdaje

> **Stav: HOTOVO.** `lib/budget.ts` počítá denní a týdenní průměr, očekávanou útratu do konce měsíce, rozdělení podle kategorií (potraviny/drogerie/děti/domácnost/ostatní), meziměsíční srovnání a plánované výdaje z nedokončených položek nákupního seznamu. `Expense` (`lib/types.ts`) nyní nese kategorii a datum, `ExpenseModal` umožňuje kategorii zvolit při zadání a `ExpenseHistory` ji zobrazuje. `BudgetOverview` propojuje plánovaný nákup, skutečné výdaje a měsíční rozpočet do reálných výpočtů a historie, ne jen vizuálního progress baru.

### Cíl
Propojit plánovaný nákup, skutečné výdaje a měsíční rozpočet.

### Základ
- měsíční rozpočet
- utraceno
- zbývá
- denní průměr
- týdenní průměr
- očekávaná útrata do konce měsíce

### Kategorie
- potraviny
- drogerie
- děti
- domácnost
- ostatní

### Analýza
- měsíční trend
- porovnání období
- plánované výdaje
- skutečné výdaje
- historie

### Propojení
Nákupní seznam může ovlivnit plánované výdaje a dokončený nákup skutečné výdaje.

### Zásada
Rozpočet není pouze vizuální progress bar. Musí být připravený na reálné výpočty a historii.
