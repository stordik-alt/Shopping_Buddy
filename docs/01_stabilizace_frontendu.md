# FAMILY SHOPPING ASSISTANT — ČÁST 1
## Stabilizace a reorganizace frontendu

### Kontext
Aktivní vývojová větev: V0/continue frontend. `main` je stabilní základ.
Současná aplikace je Next.js frontendový prototyp. Velká část UI a stavů je nyní soustředěna v `app/page.tsx`.

### Cíl
Převést současný prototyp na čistý, modulární a udržitelný frontend bez rozbití existujících funkcí.

### Úkoly
- provést audit současného `app/page.tsx`
- rozdělit UI do logických komponent
- sjednotit datové typy a rozhraní
- odstranit duplicitní logiku
- vytvořit znovupoužitelné komponenty
- zachovat současnou navigaci: Domů / Nákup / Obchody / Rozpočet / AI / Profil
- zachovat light/dark režim
- zachovat responzivitu
- zachovat současné funkce nákupních seznamů, rozpočtu, obchodů, AI, profilu, domácnosti a notifikací
- připravit strukturu pro budoucí backend a databázi

### Navržená struktura
app/
- page.tsx
- layout.tsx

components/
- dashboard/
- shopping/
- stores/
- budget/
- ai/
- profile/
- household/
- notifications/
- shared/

### Pravidlo
V této etapě neměnit produktovou logiku více, než je nutné. Nejdříve stabilizovat a modularizovat základ.

### Výstup
Čistý frontend připravený pro další etapy bez změny uživatelského konceptu.
