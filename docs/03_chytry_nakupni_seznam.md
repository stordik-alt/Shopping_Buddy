# FAMILY SHOPPING ASSISTANT — ČÁST 3
## Chytrý nákupní seznam

> **Stav: HOTOVO.** Položka (`lib/types.ts`) nyní nese produkt, množství, jednotku, kategorii, odhadovanou cenu, preferovaný obchod, příznak akce, prioritu, poznámku i stav koupit/koupeno. `components/shopping/shopping-list.tsx` podporuje přidání, úpravu (rozbalovací detail položky), odstranění, změnu množství, dokončení, filtrování podle kategorie i fulltextu, řazení (název/cena/priorita) a seskupení podle kategorie nebo obchodu. Sdílená logika vytváření položky je v `lib/items.ts`, aby ji mohl použít i budoucí generátor z jídelníčku. Datový model je připraven na budoucí propojení produkt → cena → obchod → akce → rozpočet.

### Cíl
Proměnit současný jednoduchý seznam na hlavní pracovní nástroj aplikace.

### Položka nákupu
Musí podporovat:
- produkt
- množství
- jednotku
- kategorii
- odhadovanou cenu
- preferovaný obchod
- akci
- prioritu
- poznámku
- stav koupit/koupeno

### Funkce
- přidání položky
- úprava
- odstranění
- změna množství
- dokončení
- filtrování
- řazení
- vyhledávání
- seskupení podle kategorií
- seskupení podle obchodu

### Budoucí propojení
Produkt → cena → obchod → akce → rozpočet.

### Zásada
Datový model musí umožnit pozdější napojení na skutečné ceny a databázi produktů bez zásadního přepisu UI.
