# 22 — Průvodce Anitka (maskot)

Klikatelný interaktivní návod (ne video) s maskotem Anitkou, malou holčičkou. Cíl: každému bez předchozí zkušenosti stručně a srozumitelně ukázat, co v aplikaci kde je a co kde zadat, a vyzvat k vyplnění profilu domácnosti.

## Dvě části

1. **Intro před přihlášením** (`components/auth/intro-screen.tsx`, `/intro`): logo, maskot a bublina se třemi krátkými stránkami („Další“ / „Začít“, tečky přepínají stránky, „Přeskočit“). Dokončení i přeskočení nastaví stejný příznak jako dřív (`shopping-buddy:skip-intro:v2`) a pokračuje na přihlášení.
2. **Průvodce v aplikaci** (`components/guide/guide-tour.tsx`, obsah `lib/guide.ts`): karta po kartě – úvod, Domů, Nákup, Zásoby, Rozpočet, Akce, Obchody, Recepty, Jídelníček, Profil a závěrečná karta o Anitce. Každý krok otevře správnou sekci (a u Jídelníčku si nejdřív přepne záložku) a v živé aplikaci zvýrazní, kde co najít a kde co zadat.

## Co průvodce ukazuje

- **Kde najdu sekci:** čárkovaný rámeček kolem jejího tlačítka v navigaci (na telefonu u sekcí pod „Více“ kolem „Více“; na širokém displeji v postranním panelu). Značky `data-guide-nav` jsou v `components/shared/nav-item.tsx`.
- **Kde to zadám / spustím:** plný pulzující rámeček s krátkým štítkem („Sem napište, co chybí“) kolem skutečného prvku (`GuideTarget` v `lib/guide.ts`: CSS selektor, případně přesný text tlačítka). Hledá se každý snímek, protože sekce se načítá chvíli po otevření; stránka se sama posune tak, aby prvek nebyl pod kartou (`components/guide/guide-spotlight.tsx`). Při otevřeném průvodci má stránka dole rezervu, aby se šlo posunout i u krátkých sekcí.
- Každá karta: nadpis, jedna až dvě věty, řádek „kde to najdu“, „Co udělat“; u profilu „Proč na tom záleží“.

## Maskot v kartě

Celá postava (`public/brand/anitka/anitka-mascot-full.webp`) stojí uvnitř karty v pravém sloupci a dívá se (tak, jak ji kreslí podklad) doleva, do textu, ne ven z telefonu. Obrázek se nezrcadlí, protože na tričku je nápis ANITKA. Nad ní je ikona právě vysvětlované sekce (stejná jako v navigaci). Pohyb: stále jemně dýchá a kolébá se (`guide-idle`), při každé nové kartě přiskočí a malým skokem se nakloní k textu (`guide-hop`). Karta při změně kroku plynule vjede z příslušné strany, sekce za ní se prolíná; při „omezit pohyb“ v systému jsou animace vypnuté (pravidlo v `app/globals.css`).

## Poslední karta: Anitka a AI asistent

Podle `AI_ASSISTANT_ENABLED` (`lib/features.ts`):

- **Vypnuto (dnes):** karta říká poctivě, že se Anitka ještě učí a jednou bude umět poradit s čímkoliv kolem nákupů a vaření; nic neslibuje a nemá co otevřít. Tlačítka „Hotovo“ a „Nejdřív vyplnit profil“.
- **Zapnuto:** karta ukáže, kde Anitku najít („AI asistent“, na telefonu pod „Více“), zvýrazní pole pro dotaz a nabídne „Otevřít Anitku“.

Zapnutí asistenta je samostatné rozhodnutí (CLAUDE.md oddíl 30): dnes není zapojený žádný model.

## Rozpočet a profil

Měsíční rozpočet domácnosti už není v Profilu. Nastavuje se v Rozpočtu (tlačítko „Nastavit rozpočet“ na Domů i v Rozpočtu, nebo „Upravit“ v Plánování): okno „Upravit rozpočet“ má nové pole **Měsíční rozpočet** (výchozí částka pro každé období bez vlastní). Ukládá se do stejného sloupce `households.monthly_budget`, takže se nemění ani databáze, ani výpočty. Průvodce profil zdůvodňuje alergiemi, počtem lidí a dětmi, značkami a obchody.

## Chování

- Otevře se samo jednou na zařízení; dokončení, zavření (×, Esc) nebo „Přeskočit“ uloží `anitka:guide:v1 = done` do `localStorage` (`lib/safe-storage.ts`). Znovu ho spustí položka **Průvodce aplikací** v menu účtu. Bez databáze, příznak je vázaný na zařízení.
- Texty mluví jako malá holčička k rodině: krátce, vřele, s trochou humoru, vykání, bez odborných výrazů, jedna myšlenka na kartu. Při změně funkcí upravte `lib/guide.ts`; test hlídá, že kroky míří na existující sekce, mají štítek u zvýraznění a poslední karta vede k profilu.
- Maskot: podklad je referenční obrázek od vlastníka; `anitka-mascot-bust.webp` se používá v intru. `/brand/` je veřejné i pro nepřihlášené (`proxy.ts`).
