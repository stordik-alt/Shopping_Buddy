# FAMILY SHOPPING ASSISTANT — ČÁST 5
## Obchody a lokalita

> **Stav: HOTOVO.** Typ `Store` (`lib/types.ts`) nese název, adresu, GPS, otevírací dobu, dostupné produkty a počet akcí; mock data pro všech 6 prioritních obchodů (Lidl, Albert, Kaufland, Billa, Penny, JIP) v Praze jsou v `lib/mock-data.ts` s polem `country` připraveným na budoucí další trhy. `components/stores/store-directory.tsx` umožňuje tlačítkem „Použít mou polohu" požádat o `navigator.geolocation` (GPS → obchody v okolí → vzdálenost přes `lib/geo.ts` haversine výpočet → seřazení); při zamítnutí zůstává funkční ruční zadání lokality a aplikace zobrazí vysvětlení zásady soukromí. Detail obchodu ukazuje plný profil včetně GPS souřadnic a dostupných produktů.

### První trh
Česká republika.

### Prioritní obchody
- Lidl
- Albert
- Kaufland
- Billa
- Penny
- JIP

### Profil obchodu
- název
- adresa
- GPS
- otevírací doba
- vzdálenost
- dostupné produkty
- aktuální akce

### Poloha
Uživatel může povolit použití aktuální polohy.
Aplikace potom:
GPS → obchody v okolí → vzdálenost → nabídka → doporučení.

### Zásada soukromí
Poloha se používá pouze pro funkce, které ji skutečně potřebují, například hledání obchodů v okolí. Uživatel musí mít možnost její použití odmítnout.

### Budoucnost
Architektura musí umožnit různé typy obchodů a více zemí.
