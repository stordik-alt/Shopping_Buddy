# 22 — Průvodce Anitka (maskot)

Klikatelný interaktivní návod (ne video) s maskotem Anitkou, malou holčičkou. Cíl: každému bez předchozí zkušenosti stručně a srozumitelně ukázat, co v aplikaci kde je a co kde zadat, a vyzvat k vyplnění profilu domácnosti.

## Dvě části

1. **Intro před přihlášením** (`components/auth/intro-screen.tsx`, `/intro`): logo, bublina se třemi krátkými stránkami a pod ní celá postava Anitky („Další“ / „Začít“, tečky přepínají stránky, „Přeskočit“). Od 2026-10-12 Anitka v celé postavě (`components/auth/anitka-intro-figure.tsx`) při otevření **přijde zpoza levého okraje obrazovky**: asi 2,8 s jde (tělo se při každém kroku lehce nadzvedne, nohy se zvedají střídavě), zastaví se, má zvednuté ruce a až potom se objeví bublina (0,5 s). Stojí na zemi se stínem, který chodí s ní. Obrázek je nová kresba od vlastníka (postava ve skoku), oříznutá od pozadí a rozdělená do vrstev `anitka-intro-body.webp` (horní polovina s boky), `anitka-intro-leg-left.webp` a `anitka-intro-leg-right.webp` (nohy s botami). Kresba má nohy pokrčené ve vzduchu, proto jsou rovné nohy sestavené z džínoviny z obrázku průvodce, boty jsou z kresby (otočené do profilu, pravá zrcadlená pro levou nohu). Pohyb je v `app/globals.css` (`.anitka-intro-*`), při „omezit pohyb“ prostě stojí. Starý poprsní obrázek `anitka-mascot-bust.webp` je smazaný. Nad tlačítky je zaškrtávátko **„Příště už nezobrazovat“** (výchozí: nezaškrtnuté). „Začít“ i „Přeskočit“ pokračují na přihlášení; příznak `shopping-buddy:skip-intro:v3` v `localStorage` se uloží jen při zaškrtnutí, jinak se intro příště ukáže znovu. Klíč je od 2026-10-12 `v3`: dřív ho nastavilo jakékoli tlačítko, takže ho měl každý prohlížeč, který intro kdy viděl, a staré `v2` se záměrně zahazuje, aby všichni intro uviděli ještě jednou a rozhodli se sami.
2. **Průvodce v aplikaci** (`components/guide/guide-tour.tsx`, obsah `lib/guide.ts`): karta po kartě, od úvodu přes všechny sekce a jejich podčásti (2026-10-11: 33 karet) až po poslední kartu, která ukáže, kde průvodce najít. Každý krok otevře správnou sekci (a u podčástí si nejdřív přepne záložku) a v živé aplikaci zvýrazní, kde co najít a kde co zadat.

## Co průvodce ukazuje

- **Kde najdu sekci:** čárkovaný rámeček kolem jejího tlačítka v navigaci (na telefonu u sekcí pod „Více“ kolem „Více“; na širokém displeji v postranním panelu). Značky `data-guide-nav` jsou v `components/shared/nav-item.tsx`.
- **Kde to zadám / spustím:** plný pulzující rámeček s krátkým štítkem („Sem napište, co chybí“) kolem skutečného prvku (`GuideTarget` v `lib/guide.ts`: CSS selektor, případně přesný text tlačítka). Hledá se každý snímek, protože sekce se načítá chvíli po otevření; stránka se sama posune tak, aby prvek nebyl pod kartou (`components/guide/guide-spotlight.tsx`). Při otevřeném průvodci má stránka dole rezervu, aby se šlo posunout i u krátkých sekcí.
- Každá karta: nadpis, jedna až dvě věty, řádek „kde to najdu“, „Co udělat“; u profilu „Proč na tom záleží“.

## Maskot v kartě

**Živá postava (2026-10-11, `components/guide/anitka-mascot.tsx`).** Obrázek je jeden malovaný podklad, proto je mimika dokreslená přes něj: obrázek je v kartě dvakrát, horní kopie oříznutá u krku, takže se naklání a kývá jen hlava; na ní je SVG s víčky (mrkání, mrknutí jedním okem) a ústy (úsměv a pohyb rtů, když se objeví nová karta, jako by to říkala). Ve volném stavu mrká, hlava se jemně pohybuje a občas se usměje. Každá karta má `mood` (`nod` kývne, `smile` se usmívá, `wink` mrkne, `think` nakloní hlavu, `cheer` poskočí radostí). Souřadnice jsou v pixelech podkladu (380 × 678), takže vše roste s obrázkem. Pohyby jsou v `app/globals.css` (`.anitka-*`) a pod „omezit pohyb“ se zastaví v klidné poloze. Sloupec s postavou je teď širší (6–7 rem), aby byla mimika vidět.

**Přirozený pohyb (2026-10-12).** Houpání a poskočení při změně karty bylo pryč: nepůsobilo přirozeně. Teď se jen jemně nadechuje (`guide-idle`), nová karta se plynule objeví (`guide-hop`, 0,45 s, bez skoku a bez vjezdu ze strany). Mluví po dobu úměrnou délce textu karty (`talkDurationMs`, 1,6–4,5 s, CSS proměnná `--talk`): rty se pohybují nepravidelně s pauzami mezi frázemi a hlava se při řeči lehce zdvihá a sklání (vrstva `.anitka-speak`). Mrká nepravidelně a jednou za cyklus dvakrát za sebou, hlava se v klidu jen pomalu uvolňuje do stran. Nálady (`mood`) začínají i končí v klidové poloze: `nod` kývne po domluvení, `think` na chvíli nakloní hlavu, `cheer` krátce zvedne hlavu, `wink` mrkne po domluvení a úsměv přichází až po řeči. **Gestikulace rukama zatím není:** podklad je jeden obrázek, na kterém ruce visí podél těla a jsou na dolním okraji ořezané (dlaně nejsou vidět), takže je nejde věrohodně hýbat. Vyžaduje nový podklad (postava s viditelnýma rukama, ideálně ruce zvlášť).

**Nová postava a zdravení (2026-10-12).** Maskot je nová kresba od vlastníka (postava s mávající rukou), oříznutá od pozadí bez zbytků a rozdělená do vrstev na jednom plátně 385 × 764 px v `public/brand/anitka/`: `anitka-guide-body.webp` (postava bez pravé paže, včetně hlavy), `anitka-guide-arm.webp` (svěšená pravá paže; kresba má zvednutou ruku, proto je to zrcadlená levá paže), `anitka-guide-wave-arm.webp` (zvednutá paže od ramene k loktu) a `anitka-guide-wave-hand.webp` (předloktí s dlaní, otáčí se kolem lokte). První karta (`mood: 'wave'`) ji nechá zamávat: zvednutá paže se objeví, dlaň se několikrát nestejně pohoupne a asi po 3,5 s se paže zase svěsí; na ostatních kartách ruce visí a ona gestikuluje jen hlavou a obličejem. Mimika (víčka, úsměv, rty) je znovu vykreslená SVG přes nový obličej, souřadnice v pixelech původní kresby (1088 × 1920) posunuté o ořez. Zvednutá paže stojí za tělem (vlasy ji překrývají), svěšená před ním. Při „omezit pohyb“ zůstane svěšená paže. Starý obrázek `anitka-mascot-full.webp` je smazaný; úvodní obrazovka před přihlášením má vlastní celou postavu (viz výše).

Původní popis (zachovaný níže) platí pro dýchání a umístění v kartě; skok a kolébání už neplatí a obrázek je nahrazený.

Celá postava (`public/brand/anitka/anitka-mascot-full.webp`) stojí uvnitř karty v pravém sloupci a dívá se (tak, jak ji kreslí podklad) doleva, do textu, ne ven z telefonu. Obrázek se nezrcadlí, protože na tričku je nápis ANITKA. Nad ní je ikona právě vysvětlované sekce (stejná jako v navigaci). Pohyb: stále jemně dýchá a kolébá se (`guide-idle`), při každé nové kartě přiskočí a malým skokem se nakloní k textu (`guide-hop`). Karta při změně kroku plynule vjede z příslušné strany, sekce za ní se prolíná; při „omezit pohyb“ v systému jsou animace vypnuté (pravidlo v `app/globals.css`).

## Co karty pokrývají (2026-10-11)

Pohyb po aplikaci (lišta, „Více“), Domů, zvonek a upozornění; Nákup (seznam, detail položky, víc seznamů a filtry, hledání produktů v obchodech, plán nákupu, dokončení nákupu, Moje nákupy, Účtenky); Zásoby (místa, úpravy řádku, kontrola, minimum a maximum); Rozpočet (Přehled, Výdaje, Plánování: příjmy, pravidelné platby, Kapsy, uzavření období); Akce; Obchody; Recepty a Jídelníček; Profil (domácnost, členové a děti, Moje obchody v okolí, preference, upozornění). Texty jsou psané lidsky, jako když to vysvětluje člověk vedle vás; co karta tvrdí, musí odpovídat skutečné aplikaci (při změně funkce upravte kartu v `lib/guide.ts`). Pomocné značky karty: `prepare` (klepnout nejdřív, např. na záložku), `target` s `text` (přesný text) nebo `contains` (text obsahuje; tlačítko sekce nese i shrnutí), `skipIf` a `navHint: false`.

## Poslední karta: kde průvodce najdete

Poslední karta („A kdybyste na něco zapomněli“) otevře nabídku účtu a zvýrazní v ní položku **Průvodce aplikací**; nabídku nechá otevřenou, jen pokud už otevřená je (`skipIf`). Odkaz „Nejdřív vyplnit profil“ a „Hotovo“ ukončí průvodce (nabídka se zavře). Předposlední karta je o Anitce jako asistentce:

## Karta Anitka a AI asistent

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
