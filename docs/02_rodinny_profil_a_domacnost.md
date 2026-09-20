# FAMILY SHOPPING ASSISTANT — ČÁST 2
## Rodinný profil a domácnost

> **Stav: HOTOVO.** Datové typy `Household`, `HouseholdMember`, `Child` a `HouseholdPreferences` jsou v `lib/types.ts`, mock data v `lib/mock-data.ts`. Profil domácnosti (`components/household/household-profile.tsx`) nyní spravuje název a měsíční rozpočet domácnosti, členy (jméno, role, věk, oblíbené/nechtěné potraviny, alergie), děti jako samostatné objekty (jméno, věk, preference, specifické potřeby) a nákupní preference domácnosti (značky, obchody, produkty, produkty k vyloučení, cenová/kvalitativní preference, preferování českých výrobků). Data jsou navržena jako kontext nezávislý na UI pro budoucí nákupní engine a AI.

### Cíl
Vytvořit datový základ, podle kterého bude aplikace později personalizovat nákupy, jídelníčky, rozpočet a AI.

### Domácnost
- název domácnosti
- členové
- děti
- měsíční rozpočet
- preference
- oblíbené obchody
- omezení

### Profil člena
- jméno
- role v domácnosti
- věk
- preference
- oblíbené potraviny
- potraviny, které nechce
- případné alergie/intolerance

### Děti
Samostatný objekt:
- jméno
- věk
- preference
- specifické potřeby

### Preference domácnosti
- preferované značky
- preferované obchody
- preferované produkty
- produkty, které nekupovat
- cenová preference
- preference kvality
- preference českých výrobků

### Zásada
Profil má být zdrojem kontextu pro budoucí nákupní engine a AI. Data proto navrhnout tak, aby nebyla závislá pouze na současném UI.
