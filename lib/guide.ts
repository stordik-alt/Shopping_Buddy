import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import type { Tab } from '@/lib/types'

// Content and rules of Anitka's guided tour (docs/22_GUIDE.md). Kept apart from the component so the
// steps can be tested and edited without touching UI code. Anitka is a little girl talking to a
// family: the wording is short, warm and plain (one idea per card, no feature jargon, a little humour),
// and never sounds like a manual.

/** A real element of the app the guide points at. Found by CSS selector; when `text` is given, only
 *  an element whose visible text is exactly that counts (several buttons share a selector). */
export type GuideTarget = {
  selector: string
  /** Only an element whose visible text is exactly this. */
  text?: string
  /** Only an element whose visible text contains this (a section's button also carries its summary). */
  contains?: string
  /** Skip the click of a `prepare` target while an element matching this is already there (a menu the
   *  guide opened on an earlier visit of the card must not be closed by clicking its button again). */
  skipIf?: string
}

/** What Anitka does as a card appears (components/guide/anitka-mascot.tsx): `nod` nods along, `smile` keeps a
 *  smile, `wink` winks, `think` tilts her head, `cheer` lifts her head with joy, `wave` greets with a wave of the
 *  hand (the first card only). All of them blink and "talk". */
export type GuideMood = 'nod' | 'smile' | 'wink' | 'think' | 'cheer' | 'wave'

export type GuideStep = {
  id: string
  /** The section opened behind the guide while this card is shown. */
  tab: Tab
  title: string
  /** How Anitka reacts when the card appears; `nod` when not given. */
  mood?: GuideMood
  /** One or two short sentences: what this part of the app is for. */
  text: string
  /** Where to find the section, in one short line. */
  where?: string
  /** "Co udělat": the few things the person actually has to do here. */
  todo?: string[]
  /** "Proč na tom záleží": reasons shown as a short list (the profile step). */
  why?: string[]
  /** Quick tour only: one short line for each other thing the section offers. They summarize the
   *  `detail` cards named in `covers`, which the full tour ("Podrobně") shows as cards of their own,
   *  so the short tour still tells people everything important. */
  also?: string[]
  /** Ids of the `detail` cards that this card's `also` lines summarize. */
  covers?: string[]
  /** A deep-dive card: only the full tour shows it. */
  detail?: true
  /** Something to click first so the card is about the right part of the section (e.g. the
   *  "Jídelníček" switch inside Recepty). */
  prepare?: GuideTarget
  /** Where to act in the section: the first candidate that is on screen gets the highlight. A step
   *  without a visible target (or with a section that shows something else, e.g. an empty state)
   *  simply highlights the section's entry in the navigation. */
  target?: GuideTarget[]
  /** `false` when the card's `where` is not about the section's entry in the navigation (the last card is about
   *  the account menu), so that entry is not highlighted. */
  navHint?: false
  /** The short label next to the highlight ("Sem napište"). */
  targetLabel?: string
  /** Last card only: the main button. It ends the guide, and opens `tab` when there is one. */
  cta?: { label: string; tab?: Tab }
  /** Last card only: a second, quieter button that ends the guide and opens a section. */
  secondaryCta?: { label: string; tab: Tab }
}

const BASE_STEPS: readonly GuideStep[] = [
  {
    id: 'welcome',
    tab: 'Domů',
    mood: 'wave',
    title: 'Ahoj, já jsem Anitka!',
    text: 'Ráda vás poznám. Provedu vás celou aplikací od začátku do konce, tak jako bych stála vedle vás a ukazovala prstem. Projdu to stručně, ale nic důležitého nevynechám. Kdo chce o každé funkci vědět víc, klepne nahoře na „Podrobně“. A kdykoli průvodce zavřete, hned přestanu.',
  },
  {
    id: 'navigation',
    tab: 'Domů',
    mood: 'nod',
    title: 'Jak se tu pohybovat',
    text: 'Nejčastější věci jsou dole v liště: Domů, Nákup, Zásoby a Rozpočet. Všechno ostatní schovává tlačítko „Více“. Na počítači je celé menu vlevo, nic se neskrývá.',
    where: 'Na telefonu je lišta úplně dole. Pod „Více“ najdete Akce, Obchody, Recepty a Profil.',
    todo: ['Zkuste si klepnout na jakoukoli záložku. Nic se tím nepokazí, vždycky se můžete vrátit.'],
    also: ['Změny od ostatních členů domácnosti se samy neukážou. Tlačítko „Obnovit“ v seznamu, zásobách, nákupech a rozpočtu načte jen tu část a nic vás nehodí na začátek.'],
    covers: ['refresh'],
    target: [{ selector: '[data-guide-nav="Více"]' }],
    targetLabel: 'Tady je zbytek',
  },
  {
    id: 'refresh',
    detail: true,
    tab: 'Domů',
    mood: 'nod',
    title: 'Obnovit: změny od ostatních',
    text: 'Aplikace se sama neobnovuje, aby vás nehodila na začátek uprostřed práce. Když ale někdo z domácnosti něco změnil, klepněte na „Obnovit“. Načtu jen to, co právě vidíte (seznam, zásoby, nákupy nebo rozpočet) a zůstanete přesně tam, kde jste.',
    where: 'Tlačítko je vpravo nahoře nad nákupním seznamem, nad zásobami, nad „Moje nákupy“ a nad rozpočtem.',
    todo: ['Někdo z domácnosti přidal položku na seznam? Klepněte na „Obnovit“ a uvidíte ji.', 'Bez signálu se obnovit nedá, ale seznam funguje dál.'],
  },
  {
    id: 'home',
    tab: 'Domů',
    mood: 'smile',
    title: 'Domů: dnešní přehled',
    text: 'Tohle je nástěnka na lednici, jen chytřejší: kolik vám zbývá z rozpočtu, co je na seznamu, co dnes vaříme a na které položky běží akce.',
    where: 'Dole v liště pod tlačítkem „Domů“.',
    todo: ['Čtyři rychlá tlačítka (Do nákupu, Výdaj, Účtenka, Obchody) jsou zkratky k nejčastějším věcem.'],
    also: ['„Doporučení ANITKY“ (doplnění zásob, akce na oblíbené) jdou sbalit, odmítnout a načítají se, až je rozbalíte.'],
    covers: ['home-recommendations'],
  },
  {
    id: 'home-recommendations',
    detail: true,
    tab: 'Domů',
    mood: 'wink',
    title: 'Doporučení ANITKY: sbalit i odmítnout',
    text: 'Pod přehledem jsou moje doporučení: kdy doplnit zásobu, akce na oblíbené věci a hlídání cen. Je jich moc? Klepněte na záhlaví a sbalí se. Dokud jsou sbalená, nic se pro ně nenačítá. Návrh, který nechcete, odmítnete křížkem a odmítnutí platí pro celou domácnost.',
    where: 'Na Domů pod dnešním jídelníčkem, záhlaví „Doporučení ANITKY“.',
    todo: ['Klepněte na záhlaví a sbalte, co vás zrovna nezajímá.', '„Na seznam“ u návrhu přidá nejlevnější variantu rovnou s množstvím, které chybí do maxima.'],
    target: [{ selector: 'section[aria-label="Doporučení ANITKY"] button' }],
    targetLabel: 'Sbalit a rozbalit',
  },
  {
    id: 'bell',
    tab: 'Domů',
    mood: 'nod',
    title: 'Zvonek: dám vám vědět',
    text: 'Ozvu se zvonkem, když se blížíte limitu rozpočtu, když běží akce na položky ze seznamu, vyjde nový leták, je čas zkontrolovat zásoby nebo něco zaplatit. Na telefonu pošlu i oznámení.',
    where: 'Vpravo nahoře, vedle kolečka s vaším účtem.',
    todo: ['Co nechcete slyšet, vypnete v Profilu u „Upozornění“.'],
    target: [{ selector: 'button[aria-label^="Oznámení"]' }],
    targetLabel: 'Tady zvoním',
  },
  {
    id: 'shopping',
    tab: 'Nákup',
    mood: 'smile',
    title: 'Nákupní seznam: co máme koupit',
    text: 'Napište, co chybí, a já nabídnu konkrétní produkty a druhy zboží, ať se to dobře hledá ve slevách. V obchodě odškrtáváte, co je v košíku.',
    where: 'Pod „Nákup“, záložka „Nákupní seznam“.',
    todo: ['Napište třeba mléko a klepněte na „Přidat“.', 'V obchodě klepněte na kolečko vlevo u věci, kterou už máte.'],
    also: [
      'Klepnutím na řádek nastavíte množství, kategorii, obchod, prioritu a poznámku.',
      'Další seznamy (třeba „Vánoce“) a „Filtry a řazení“ pro dlouhé seznamy.',
      '„Obnovit“ nahoře načte změny, které udělal někdo z domácnosti, a stránka se neposune.',
      'Omylem smazané vrátí „Zpět“ a bez signálu seznam funguje dál.',
    ],
    covers: ['shopping-detail', 'shopping-lists', 'shopping-undo'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení nákupu"] button', text: 'Nákupní seznam' },
    target: [{ selector: 'input[aria-label="Nová položka"]' }],
    targetLabel: 'Sem napište, co chybí',
  },
  {
    id: 'shopping-detail',
    detail: true,
    tab: 'Nákup',
    mood: 'nod',
    title: 'Co všechno jde u položky nastavit',
    text: 'Každý řádek ukazuje název a kolik toho koupit. Když na řádek klepnete, rozbalí se: množství a jednotka, kategorie, preferovaný obchod, priorita, poznámka (třeba „bez laktózy“) a druh zboží. Když na položku běží akce, uvidíte u ní odznak s cenou a obchodem. Přidáte-li na seznam něco, co podle zásob máte doma, zeptám se: „Došlo?“ Odpovíte „Ano, došlo“ a zásoby se opraví, nebo „Ještě mám“ a nic se nezmění.',
    where: 'Klepněte na šipku vpravo u libovolné položky.',
    todo: ['Změňte množství, třeba na 2 litry.', 'Do poznámky napište, co je důležité, třeba značku.'],
    target: [{ selector: 'button[aria-label^="Detail položky"]' }],
    targetLabel: 'Klepněte na šipku',
  },
  {
    id: 'shopping-lists',
    detail: true,
    tab: 'Nákup',
    mood: 'smile',
    title: 'Víc seznamů, filtry a řazení',
    text: 'Kromě hlavního seznamu si můžete založit další, třeba „Vánoce“ nebo „Chata“. A když je seznam dlouhý, přes „Filtry a řazení“ si ho vyfiltrujete, seřadíte podle priority nebo seskupíte podle kategorie či obchodu. Hotové věci jde schovat. Vaše nastavení si pamatuju.',
    where: 'Hned pod polem „Co koupit?“ jsou seznamy a tlačítko „Filtry a řazení“.',
    todo: ['Klepněte na „+ Nový seznam“ a pojmenujte ho.', 'Zkuste seskupit podle obchodu, ať víte, co kde koupit.'],
    target: [{ selector: 'button', contains: 'Filtry a řazení' }],
    targetLabel: 'Filtry a řazení',
  },
  {
    id: 'shopping-undo',
    detail: true,
    tab: 'Nákup',
    mood: 'smile',
    title: 'Omyl? Zpět. A co bez signálu?',
    text: 'Když položku odeberete nebo smažete, na pár vteřin se dole objeví „Zpět“ a vrátí ji. V obchodě bez signálu seznam funguje dál: změny se uloží v telefonu a odešlu je, až se připojení vrátí. Nahoře uvidíte, kolik jich čeká. Položku přidáte i klávesou Enter.',
    where: 'Lišta „Zpět“ vyskočí dole nad lištou aplikace; upozornění na signál nahoře nad seznamem.',
    todo: ['Zkuste položku odebrat a hned klepnout na „Zpět“.'],
  },
  {
    id: 'shopping-search',
    tab: 'Nákup',
    mood: 'think',
    title: 'Hledání produktů v obchodech',
    text: 'Kolik co stojí jinde? Najdu produkt v obchodech, které máte nastavené, a ukážu cenu i za kilo či litr, ať se dají srovnat různá balení. Jedním klepnutím ho přidáte na seznam.',
    where: 'Odkaz „Hledat produkty v obchodech“ nad seznamem; stejné hledání je i v detailu položky.',
    todo: ['Napište, co hledáte, a klepnutím produkt přidejte na seznam.'],
    target: [{ selector: 'button', contains: 'Hledat produkty v obchodech' }],
    targetLabel: 'Tady hledejte',
  },
  {
    id: 'shopping-plan',
    tab: 'Nákup',
    mood: 'think',
    title: 'Plán nákupu: kde co koupit',
    text: 'U delšího seznamu spočítám, kde se vyplatí nakoupit: řeknete, kolik obchodů projdete a které preferujete, a poskládám, co kde koupit nejlevněji. Ukážu i cenu, kdybyste šli jen do jednoho obchodu.',
    where: 'Úplně dole pod seznamem, panel „Plán nákupu“.',
    todo: ['Zvolte počet obchodů a klepněte na „Sestavit plán“. Po změně seznamu ho sestavte znovu.'],
    // On an empty list the panel has no button yet, so the guide points at its heading instead.
    target: [{ selector: 'button', text: 'Sestavit plán' }, { selector: 'h3', text: 'Plán nákupu' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'shopping-finish',
    tab: 'Nákup',
    mood: 'cheer',
    title: 'Hotovo? Dokončete nákup',
    text: 'Jakmile něco odškrtnete, objeví se dole „Dokončit nákup“ a odškrtnuté věci ze seznamu zmizí. Nákup, výdaj v rozpočtu ani zásoby z toho nevzniknou. Zapíšou se z účtenky nebo ručně v „Moje nákupy“.',
    where: 'Tlačítko se ukáže dole nad lištou, jakmile něco odškrtnete.',
    todo: ['Chcete nákup v rozpočtu a zásoby doma? Vyfoťte účtenku, nebo ho zadejte ručně.'],
  },
  {
    id: 'purchases',
    detail: true,
    tab: 'Nákup',
    mood: 'smile',
    title: 'Moje nákupy: co jste kupovali',
    text: 'Tady je historie všech nákupů: kdy, kde a za kolik, i s jednotlivými položkami. Vznikají z účtenek nebo z ručního zápisu. Každý nákup se započítá do rozpočtu a koupené věci se přidají do zásob. Podle historie poznám, co kupujete pravidelně, a nabídnu vám to jako „Obvyklé nákupy“ na seznam.',
    where: 'V sekci „Nákup“ klepněte nahoře na „Moje nákupy“.',
    todo: ['Projděte si poslední nákupy.', 'Nákup bez účtenky přidáte tlačítkem „Zadat nákup ručně“.', 'Když jste nákup zapsali omylem, jde smazat.'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení nákupu"] button', text: 'Moje nákupy' },
  },
  {
    id: 'receipts',
    tab: 'Nákup',
    mood: 'cheer',
    title: 'Účtenky: vyfotit a hotovo',
    text: 'Nechce se vám psát? Vyfoťte účtenku nebo nahrajte fotku či PDF. Přečtu obchod, datum i položky, vy zkontrolujete. Vznikne nákup, výdaj v rozpočtu a doplní se zásoby. Když si nejsem jistá, zeptám se.',
    where: 'V „Nákup“ nahoře „Účtenky“; kolečko s číslem znamená, že na vás něco čeká.',
    todo: ['Klepněte na „Nahrát účtenku“, vyfoťte ji celou, rovně a na světle, a zkontrolujte položky.'],
    also: [
      '„Moje nákupy“: historie, ruční zápis nákupu bez účtenky, smazání omylu.',
      'Nákup se započítá do rozpočtu a zásob; z historie nabídnu „Obvyklé nákupy“.',
    ],
    covers: ['purchases'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení nákupu"] button', contains: 'Účtenky' },
    target: [{ selector: 'button', contains: 'Nahrát účtenku' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'pantry',
    tab: 'Zásoby',
    mood: 'smile',
    title: 'Zásoby: co je doma',
    text: 'Přehled toho, co máte doma: ve spíži, lednici, mrazáku i jinde. Zásoby se plní z účtenek a z ručně zapsaných nákupů. Jakmile tu něco bude, uvidíte nahoře místa jako složky. Vlastní místo, třeba „Kufr auta“, si přidáte v Profilu.',
    where: 'Pod tlačítkem „Zásoby“.',
    todo: ['Chybí tu něco, co doma máte? Klepněte na „Přidat“.', 'Až tu něco bude, klepnutím na místo nahoře (třeba Lednice) uvidíte, co v něm je.'],
    also: [
      'Fajfka = „ještě mám“, křížek = „došlo“; množství měníte tlačítky − a +, tužkou kategorii, umístění a sledování.',
      '„Zkontrolovat“: odhadnu, co už došlo, a vy mi jen opravíte, co se nezdá.',
      'Minimum a maximum podle druhu zboží (nastavíte v Profilu): až zásoba klesne a někde je akce, poradím, co dokoupit.',
      'Prací gely počítám na dávky: gel na 45 dávek se do zásob zapíše jako 45 dávek.',
    ],
    covers: ['pantry-rows', 'pantry-check', 'pantry-levels', 'pantry-doses'],
    target: [{ selector: 'section[aria-label^="Zásoby:"] button', text: 'Přidat' }],
    targetLabel: 'Tady přidáte zásobu',
  },
  {
    id: 'pantry-rows',
    detail: true,
    tab: 'Zásoby',
    mood: 'nod',
    title: 'Co udělat s položkou',
    text: 'U každé položky upravíte množství tlačítky − a + nebo číslo přepíšete. Fajfka znamená „ještě mám“, křížek „došlo“. Přes tužku změníte kategorii, podkategorii, umístění nebo sledování. Sůl a koření nemusím hlídat tak často jako mléko, proto jim nastavte „Jen zřídka“ nebo „Nesledovat“. Štítek „Asi došlo“ znamená, že podle vašich nákupů to už nejspíš došlo, a „Dokoupit“, že zásoba klesla k minimu. Pokud je stejná věc na víc místech, upozorním vás nahoře: „Na více místech“. Zkontrolujte, zda nejde o duplicitu.',
    where: 'Vpravo na každém řádku jsou fajfka, křížek a tužka; množství je uprostřed.',
    todo: ['Klepněte na tužku u položky a podívejte se, co jde změnit.', 'Když položka došla, klepněte na křížek. Ze zásob zmizí.'],
    target: [{ selector: 'button[aria-label^="Upravit: "]' }],
    targetLabel: 'Tužka = úpravy',
  },
  {
    id: 'pantry-check',
    detail: true,
    tab: 'Zásoby',
    mood: 'think',
    title: 'Kontrola zásob a odhad, co došlo',
    text: 'Zásoby se časem rozcházejí se skutečností, proto se občas zeptám: „Máte to ještě?“ Podle toho, jak často věc kupujete, odhadnu, co asi došlo. Takové položky jsou v kontrole předvyplněné jako „Došlo“, ostatní jako „Mám“. Opravíte jen to, co nesedí, a uložíte. Všechno ostatní se potvrdí a co došlo, můžete rovnou přidat na nákupní seznam. Kontrolu najdete i v pruhu „K ověření“ nahoře.',
    where: 'Tlačítko „Zkontrolovat“ je vpravo nahoře nad položkami. Když se na něco ptám, najdete ho i v pruhu „Máte je ještě?“ a na Domů.',
    todo: ['Klepněte na „Zkontrolovat“ a u položek, které nesedí, změňte „Mám“ na „Došlo“ nebo naopak.', 'U ostatních se nic dělat nemusí, stačí uložit.'],
    target: [{ selector: 'section[aria-label^="Zásoby:"] button', contains: 'Zkontrolovat' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'pantry-levels',
    detail: true,
    tab: 'Zásoby',
    mood: 'wink',
    title: 'Hlídání minima a maxima',
    text: 'U věcí, které nesmí chybět, nastavte minimum a maximum podle druhu zboží, třeba „Máslo“, ne podle značky. Sečtu všechno máslo, které máte doma. Když ho zbývá málo a v některém z vašich obchodů je akce, najdu tu nejlevnější a poradím, kolik dokoupit. Návrh uvidíte na Domů a u položky v zásobách se objeví štítek „Dokoupit“.',
    where: 'V Profilu, záložka „Zásoby“, blok „Hlídané zásoby“.',
    todo: ['Vyberte druh zboží a zadejte minimum (kdy začít myslet na nákup) a maximum (kolik chcete mít nejvíc).', 'V Profilu v části „Nákup a obchody“ můžete vybrat prioritní obchody, ať vím, kam vás poslat. Bez nich hledám v obchodech, které máte nastavené.'],
  },
  {
    id: 'pantry-doses',
    detail: true,
    tab: 'Zásoby',
    mood: 'think',
    title: 'Dávky: prací gely a prášky',
    text: 'Prací gel se nepočítá na kusy, ale na dávky. Na účtence poznám třeba „WOOLITE pr.gel 45PD“ a do zásob přidám 45 dávek. Minimum a maximum pro prací gel si pak můžete nastavit přesně v dávkách. Jednotku „dávka“ najdete mezi ostatními jednotkami u položky seznamu i zásob.',
    where: 'U množství vedle jednotky (ks, kg, l, …) je i „dávka“.',
    todo: ['Při ručním přidání gelu do zásob vyberte jednotku „dávka“.'],
  },
  {
    id: 'budget',
    tab: 'Rozpočet',
    mood: 'smile',
    title: 'Rozpočet: kam mizí peníze',
    text: 'Nastavte limit na období a dám vám vědět, až utratíte 80 % i 100 %. V Přehledu uvidíte, kolik je utraceno, kolik zbývá a kam peníze šly.',
    where: 'Pod „Rozpočet“, záložka „Přehled“.',
    todo: ['Klepněte na „Nastavit rozpočet“ a napište částku. Pak se podívejte, jak vám vychází konec období.'],
    also: [
      'Výdaje: ručně nebo z účtenky, upravit či smazat jde kdykoli.',
      'Plánování: příjmy a plánované výdaje, spočítám, kolik zbude.',
      'Pravidelné platby (nájem, předplatné): připomenu v den splatnosti.',
      'Kapsy (spoření na cíle) a konec období (co s přebytkem či schodkem).',
    ],
    covers: ['expenses', 'planning', 'recurring', 'pockets', 'period-close'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení rozpočtu"] button', text: 'Přehled' },
    target: [{ selector: 'button', text: 'Nastavit rozpočet' }, { selector: 'button', contains: 'Upravit rozpočet' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'expenses',
    detail: true,
    tab: 'Rozpočet',
    mood: 'nod',
    title: 'Výdaje: zapište, co jste utratili',
    text: 'Každý výdaj má částku, kategorii, datum a obchod. Zapíšete ho ručně, nebo vznikne sám z účtenky. Výdaje si procházíte podle data či kategorií a když se spletete, opravíte je nebo smažete.',
    where: 'V sekci „Rozpočet“ klepněte nahoře na „Výdaje“.',
    todo: ['Klepněte na „Přidat výdaj“, zadejte částku a kategorii.', 'Mrkněte i na období nahoře. Šipkami se přepínáte mezi měsíci.'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení rozpočtu"] button', text: 'Výdaje' },
    target: [{ selector: 'button', contains: 'Přidat výdaj' }, { selector: 'button', contains: 'Zapsat první výdaj' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'planning',
    detail: true,
    tab: 'Rozpočet',
    mood: 'think',
    title: 'Plánování: příjmy a plánované výdaje',
    text: 'Tady se dívám dopředu. Zapíšete očekávané příjmy (výplatu) a plánované výdaje (dovolená, oprava auta) a já spočítám, kolik vám opravdu zbude. Skutečné výdaje jsou ty, které už se staly, plánované teprve přijdou.',
    where: 'V sekci „Rozpočet“ klepněte nahoře na „Plánování“. Jednotlivé bloky se rozklikávají.',
    todo: ['Otevřete „Příjmy“ a přidejte výplatu.', 'U „Plánované výdaje“ přidejte, co vás čeká.'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení rozpočtu"] button', text: 'Plánování' },
    target: [{ selector: 'section button', contains: 'Příjmy' }],
    targetLabel: 'Otevřete „Příjmy“',
  },
  {
    id: 'recurring',
    detail: true,
    tab: 'Rozpočet',
    mood: 'nod',
    title: 'Pravidelné platby',
    text: 'Nájem, pojištění, předplatné. Zapište je jednou a já je budu hlídat. V den splatnosti vám připomenu, že je čas platit, a když platbu potvrdíte, zapíše se jako výdaj.',
    where: 'V Rozpočtu na záložce „Přehled“ je dole blok „Pravidelné platby“.',
    todo: ['Zadejte název platby, částku, jak často se opakuje a první splatnost.', 'V den splatnosti ji potvrďte, nebo přeskočte.'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení rozpočtu"] button', text: 'Přehled' },
    target: [{ selector: 'section button', contains: 'Pravidelné platby' }],
    targetLabel: 'Pravidelné platby',
  },
  {
    id: 'pockets',
    detail: true,
    tab: 'Rozpočet',
    mood: 'cheer',
    title: 'Kapsy: spoření na cíle',
    text: 'Chcete našetřit na dovolenou nebo na rezervu? Založte si Kapsu s cílovou částkou a termínem a průběžně do ní odkládejte. Uvidíte, kolik už máte a jestli to stihnete.',
    where: 'V Plánování otevřete blok „Kapsy“.',
    todo: ['Založte Kapsu, pojmenujte ji a zadejte cíl.', 'Peníze do ní převádíte, když vám zbydou.'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení rozpočtu"] button', text: 'Plánování' },
    target: [{ selector: 'section button', contains: 'Kapsy' }],
    targetLabel: 'Kapsy',
  },
  {
    id: 'period-close',
    detail: true,
    tab: 'Rozpočet',
    mood: 'smile',
    title: 'Konec období a převod peněz',
    text: 'Když období skončí, pomůžu vám ho zavřít. Uvidíte výsledek, a pokud vám něco zbylo, rozhodnete, co s tím (třeba do Kapsy nebo do dalšího období). Při schodku vám nabídnu, jak ho pokrýt. Starší období si kdykoli otevřete ve Výdajích.',
    where: 'Až období skončí, objeví se nahoře v Plánování karta „Minulé období skončilo“ s tlačítkem „Uzavřít období“.',
    todo: ['Klepněte na „Uzavřít období“ a rozhodněte, co s přebytkem nebo schodkem.', 'Dřívější období otevřete ve Výdajích přes výběr období nahoře.'],
    prepare: { selector: '[role="group"][aria-label="Zobrazení rozpočtu"] button', text: 'Plánování' },
    target: [{ selector: 'button', text: 'Uzavřít období' }],
    targetLabel: 'Uzavřít období',
  },
  {
    id: 'deals',
    tab: 'Akce',
    mood: 'wink',
    title: 'Akce: kde je opravdu levněji',
    text: 'Slevy z letáků na jednom místě. U každé akce ukážu cenu za kilo či litr a řeknu, jestli je to opravdu nejlepší cena, ne jen velké procento. Filtrujte podle obchodu a kategorie; „Pro mě“ ukáže jen to, co sedí vašim značkám a produktům.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Akce“.',
    todo: ['Napište, co hledáte, nebo si listujte. Co se vám líbí, klepnutím přidáte „Na seznam“.'],
    target: [{ selector: 'input[aria-label="Hledat v akcích"]' }],
    targetLabel: 'Sem napište, co hledáte',
  },
  {
    id: 'stores',
    tab: 'Obchody',
    mood: 'think',
    title: 'Obchody: prodejny ve vašem městě',
    text: 'Napište své město a ukážu prodejny řetězců, kde jsou a jak daleko. Hodí se při výběru, kam zajít, nebo když jedete někam, kde to neznáte.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Obchody“.',
    todo: ['Napište město (třeba Brno). Které řetězce navštěvujete, nastavíte v Profilu.'],
    target: [{ selector: 'input[aria-label="Lokalita"]' }],
    targetLabel: 'Sem napište město',
  },
  {
    id: 'recipes',
    tab: 'Recepty',
    mood: 'smile',
    title: 'Recepty: co dnes vaříme',
    text: 'Nevíte, co k večeři? Poradím podle toho, co máte doma. Recepty jde hledat, upravit porce a chybějící suroviny přidat na seznam jedním klepnutím. Oblíbené uložíte a historie ukáže, co jste naposledy otevřeli.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Recepty“.',
    todo: ['Klepněte na „Navrhnout recepty“ a suroviny z receptu přidejte na seznam.'],
    prepare: { selector: '[role="group"][aria-label="Recepty"] button', text: 'Recepty' },
    target: [{ selector: 'button', text: 'Navrhnout recepty' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'mealplan',
    tab: 'Recepty',
    mood: 'cheer',
    title: 'Jídelníček: plán na týden',
    text: 'Nechcete každý den přemýšlet, co uvařit? Sestavím vám jídelníček na celý týden. Vezmu v úvahu, co kdo z domácnosti jí a co ne, a také to, co máte v zásobách. Suroviny, které chybí, přidáte na nákupní seznam jedním klepnutím. Dnešní jídlo uvidíte i na Domů.',
    where: 'Na telefonu dole „Více“ → „Recepty“ → záložka „Jídelníček“.',
    todo: ['Klepněte na „Vytvořit jídelníček“ a chybějící suroviny přidejte na seznam.'],
    prepare: { selector: '[role="group"][aria-label="Recepty"] button', text: 'Jídelníček' },
    target: [{ selector: 'button', text: 'Vytvořit jídelníček' }, { selector: 'button', text: 'Vytvořit nový jídelníček' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'profile',
    tab: 'Profil',
    mood: 'cheer',
    title: 'Profil: to nejdůležitější!',
    text: 'Mám jednu velkou prosbu: vyplňte profil domácnosti. Podle alergií, počtu lidí a dětí, značek a obchodů poradím správně a ukážu jen slevy, které se vás týkají.',
    where: 'Na telefonu dole „Více“ a pak „Profil“.',
    why: [
      'Alergie a to, co nejíte: nic nevhodného nenavrhnu.',
      'Počet lidí a věk dětí: správná množství i jídla pro děti.',
      'Oblíbené značky a obchody: jen slevy, které se vás týkají.',
    ],
    todo: ['Zkontrolujte název domácnosti, přidejte členy a děti (věk, alergie, co nejí) a vyberte oblíbené značky a obchody.'],
    also: [
      'Profil je rozdělený na Domácnost, Nákup a obchody, Zásoby a Upozornění.',
      'Členové a děti: stravování, alergie, věk. Pozvaní sdílejí seznam, zásoby i rozpočet (změny druhých po „Obnovit“ či obnovení stránky).',
      'Obchody v okolí a nákupní preference: kam chodíte, prioritní obchody, oblíbené značky, co nekupovat.',
      'Upozornění (vyberte, která chcete); v Zásobách vlastní místa, hlídané zásoby a kontrola.',
      'Zakladatel domácnosti vidí na konci záložky Domácnost „Historii změn“: kdo změnil rozpočet, výdaje, příjmy a členy.',
      'Pod ní je „Smazání dat“ (jen pro zakladatele): červené tlačítko, které nevratně smaže vybraná data, profil zůstane.',
    ],
    covers: ['profile-members', 'profile-stores', 'profile-preferences', 'profile-stock', 'profile-notifications', 'profile-history', 'profile-reset'],
    target: [{ selector: '[data-guide="household-name"]' }],
    targetLabel: 'Začněte jménem domácnosti',
  },
  {
    id: 'profile-members',
    detail: true,
    tab: 'Profil',
    mood: 'smile',
    title: 'Členové, děti a pozvánky',
    text: 'U každého člena nastavíte způsob stravování, alergie a co nejí. U dětí věk a zvláštní potřeby. Další dospělé pozvete e-mailem a ti pak uvidí a mohou upravovat stejný nákupní seznam, zásoby i rozpočet. Změny druhých se ale ukážou až po tlačítku „Obnovit“ nad nákupním seznamem, jinde po obnovení stránky.',
    where: 'V Profilu, záložka „Domácnost“: „Členové domácnosti“ a pod ním „Děti“.',
    todo: ['Přidejte e-mail dalšího člena a pošlete pozvánku.', 'U dětí vyplňte věk a alergie.'],
    target: [{ selector: 'section button', contains: 'Děti' }],
    targetLabel: 'Tady jsou děti',
  },
  {
    id: 'profile-stores',
    detail: true,
    tab: 'Profil',
    mood: 'wink',
    title: 'Moje obchody v okolí',
    text: 'Vyberte řetězce, kam opravdu chodíte, a jak daleko jste ochotní jet. Akce a ceny pak ukážu jen z nich. Některé můžete označit jako prioritní. Ty zohledním při plánu nákupu a při radě „dokoupit do zásoby“. Nastavíte i to, kolik obchodů jste ochotní při jednom nákupu projít.',
    where: 'V Profilu, záložka „Nákup a obchody“, blok „Moje obchody v okolí“.',
    todo: ['Zaškrtněte řetězce, které máte poblíž.', 'Volitelně označte prioritní obchody a kolik jich chcete projít.'],
    prepare: { selector: '[role="group"][aria-label="Část profilu"] button', text: 'Nákup a obchody' },
    target: [{ selector: 'section button', contains: 'Moje obchody v okolí' }],
    targetLabel: 'Moje obchody',
  },
  {
    id: 'profile-preferences',
    detail: true,
    tab: 'Profil',
    mood: 'nod',
    title: 'Nákupní preference',
    text: 'Oblíbené značky, obchody a produkty a také věci, které nechcete kupovat. Podle toho vybírám slevy do „Pro mě“ a na Domů, a to, co nechcete, se v nabídkách vůbec neukáže.',
    where: 'V Profilu, záložka „Nákup a obchody“, blok „Nákupní preference domácnosti“.',
    todo: ['Vyplňte pár oblíbených značek a produktů.', 'Do „Produkty, které nekupovat“ napište, čemu se chcete vyhnout.'],
    prepare: { selector: '[role="group"][aria-label="Část profilu"] button', text: 'Nákup a obchody' },
    target: [{ selector: 'section button', contains: 'Nákupní preference domácnosti' }],
    targetLabel: 'Preference',
  },
  {
    id: 'profile-stock',
    detail: true,
    tab: 'Profil',
    mood: 'wink',
    title: 'Zásoby v Profilu',
    text: 'Tady si nastavíte, jak se o zásoby starám: vlastní místa (třeba „Kufr auta“), jak často se mám ptát „Máte to ještě?“ podle kategorie a hlídané zásoby, tedy minimum a maximum podle druhu zboží, i v dávkách.',
    where: 'V Profilu klepněte na záložku „Zásoby“.',
    todo: ['V bloku „Hlídané zásoby“ vyberte druh zboží, třeba Máslo, a zadejte minimum a maximum.', 'Kontrolu zásob nechte klidně na výchozích hodnotách.'],
    prepare: { selector: '[role="group"][aria-label="Část profilu"] button', text: 'Zásoby' },
    target: [{ selector: 'section button', contains: 'Hlídané zásoby' }],
    targetLabel: 'Hlídané zásoby',
  },
  {
    id: 'profile-notifications',
    detail: true,
    tab: 'Profil',
    mood: 'think',
    title: 'Upozornění',
    text: 'Tady si vyberete, která upozornění chcete: rozpočet, akce na seznamu, připomínka nákupu, kontrola zásob, splatné platby. Ostatním členům se tím nic nemění.',
    where: 'V Profilu klepněte na záložku „Upozornění“.',
    todo: ['Vypněte upozornění, která nechcete.', 'Na telefonu zapněte oznámení, ať vám nic neuteče.'],
    prepare: { selector: '[role="group"][aria-label="Část profilu"] button', text: 'Upozornění' },
    target: [{ selector: 'section button', contains: 'Upozornění' }],
    targetLabel: 'Upozornění',
  },
  {
    id: 'profile-history',
    detail: true,
    tab: 'Profil',
    mood: 'think',
    title: 'Historie změn',
    text: 'Zakladatel domácnosti vidí, kdo a kdy změnil rozpočet, výdaje, příjmy nebo členy. Hodí se, když se čísla najednou nesedí a chcete vědět proč. Ostatní členové tuhle část nevidí.',
    where: 'V Profilu, záložka „Domácnost“, úplně dole („Historie změn“).',
    todo: ['Rozbalte ji, když budete chtít zjistit, kdo co upravil.'],
    prepare: { selector: '[role="group"][aria-label="Část profilu"] button', text: 'Domácnost' },
    target: [{ selector: 'section button', contains: 'Historie změn' }],
    targetLabel: 'Kdo co změnil',
  },
  {
    id: 'profile-reset',
    detail: true,
    tab: 'Profil',
    mood: 'think',
    title: 'Smazání dat',
    text: 'Chcete začít s čistým štítem? Zakladatel domácnosti může smazat vybraná data: nákupy a účtenky, výdaje, příjmy, rozpočty a plány, zásoby, recepty nebo oznámení. Profil, členové, děti, preference a obchody zůstanou. Smazání je nevratné a týká se celé domácnosti, proto je potřeba opsat její název.',
    where: 'V Profilu, záložka „Domácnost“, úplně dole („Smazání dat“). Vidí ho jen zakladatel.',
    todo: ['Zaškrtněte jen to, co opravdu chcete smazat. Nic není předvybrané.'],
    prepare: { selector: '[role="group"][aria-label="Část profilu"] button', text: 'Domácnost' },
    target: [{ selector: 'section button', contains: 'Smazání dat' }],
    targetLabel: 'Nevratné!',
  },
]

// The card about Anitka herself, the assistant. While the assistant is not switched on (lib/features.ts)
// there is nothing to open, so the card says honestly that she is still learning instead of promising
// answers; switched on, it points at her screen.
function anitkaStep(aiEnabled: boolean): GuideStep {
  if (aiEnabled) {
    return {
      id: 'anitka',
      tab: 'AI',
      mood: 'cheer',
      title: 'Poradím s čímkoli',
      text: 'Kdykoli si se mnou můžete popovídat. Zeptejte se na nákup, slevy nebo večeři a já poradím.',
      where: 'Najdete mě v nabídce „AI asistent“. Na telefonu klepněte dole na „Více“.',
      todo: ['Napište mi, co potřebujete, třeba „nákup na týden do 2 500 Kč“.'],
      target: [{ selector: 'input[placeholder^="Např. nákup na týden"]' }],
      targetLabel: 'Sem se mě zeptejte',
    }
  }
  return {
    id: 'anitka',
    tab: 'Domů',
    mood: 'smile',
    title: 'Brzy si budeme povídat',
    text: 'Ještě se učím. Jednou vám budu umět poradit s čímkoliv kolem nákupů a vaření a najdete mě tady v aplikaci. Zatím mi nejvíc pomůže váš vyplněný profil.',
  }
}

// The account menu holds the few things that belong to the person, not to a section. It is opened the same way
// as on the last card (`skipIf` keeps an already open menu from being closed again).
const ACCOUNT_MENU_STEP: GuideStep = {
  id: 'account-menu',
  detail: true,
  tab: 'Domů',
  mood: 'smile',
  title: 'Nabídka účtu',
  text: 'Nabídka pod kolečkem s iniciálou obsahuje kromě průvodce „Stáhnout aplikaci do mobilu“ (ikona na ploše, funguje jako běžná aplikace), „Nápady pro zlepšení“ (napište, co by se vám líbilo), přepínač světlého a tmavého motivu a odhlášení. Úplně dole je „Smazat účet“. Smaže-li účet člen, odejde z domácnosti a ostatním zůstane. Smaže-li ho zakladatel, smaže se celá domácnost. Vždy je potřeba potvrdit vlastním e-mailem.',
  where: 'Vpravo nahoře klepněte na kolečko s iniciálou.',
  todo: ['Na telefonu si aplikaci stáhněte na plochu, bude po ruce v obchodě.'],
  navHint: false,
  prepare: { selector: 'button[aria-label="Účet a nastavení"]', skipIf: '[role="menu"][aria-label="Účet"]' },
  target: [{ selector: '[role="menuitem"]', contains: 'Nápady pro zlepšení' }],
  targetLabel: 'Nápady a nastavení',
}

// The very last card shows exactly where to find the guide again: the account menu, opened and with its
// "Průvodce aplikací" item highlighted. `skipIf` keeps a menu that is already open (coming back to this
// card) from being closed by the click that opens it.
const FIND_ME_STEP: GuideStep = {
  id: 'findme',
  tab: 'Domů',
  mood: 'wink',
  title: 'A kdybyste na něco zapomněli',
  also: ['V téže nabídce najdete i stažení aplikace do mobilu, nápady na zlepšení, tmavý motiv, odhlášení a smazání účtu.'],
  covers: ['account-menu'],
  text: 'To je celé! Kdykoli budete chtít něco připomenout, spusťte mě znovu a ukážu to od začátku; nic se tím nezmění. Klidně to projděte jen zčásti a vraťte se, až budete mít chuť.',
  where: 'Vpravo nahoře klepněte na kolečko s iniciálou; v nabídce účtu je „Průvodce aplikací“.',
  todo: ['Jednou ho najděte, ať víte, kde mě hledat. Teď je v nabídce zvýrazněný.'],
  navHint: false,
  prepare: { selector: 'button[aria-label="Účet a nastavení"]', skipIf: '[role="menu"][aria-label="Účet"]' },
  target: [{ selector: '[role="menuitem"]', contains: 'Průvodce aplikací' }],
  targetLabel: 'Tady mě najdete',
  cta: { label: 'Hotovo' },
  secondaryCta: { label: 'Nejdřív vyplnit profil', tab: 'Profil' },
}

/** The tour's cards. The card about the assistant depends on whether it is switched on; the last one always
 *  shows where to find the guide again. */
export function getGuideSteps(aiEnabled: boolean): readonly GuideStep[] {
  return [...BASE_STEPS, ACCOUNT_MENU_STEP, anitkaStep(aiEnabled), FIND_ME_STEP]
}

/** The full tour: every card. */
export const GUIDE_STEPS = getGuideSteps(AI_ASSISTANT_ENABLED)

/** The quick tour people start with: the full tour without its deep-dive (`detail`) cards, whose
 *  content the section cards summarize in their `also` lines. */
export function getQuickGuideSteps(aiEnabled: boolean): readonly GuideStep[] {
  return getGuideSteps(aiEnabled).filter((step) => !step.detail)
}

export const QUICK_GUIDE_STEPS = getQuickGuideSteps(AI_ASSISTANT_ENABLED)

/** Where to land after switching between the quick and the full tour: the same card when the other
 *  tour has it, otherwise the nearest earlier card it does have (a deep-dive card turns into the
 *  section's main card). */
export function indexAfterModeSwitch(currentId: string, from: readonly GuideStep[], to: readonly GuideStep[]): number {
  const position = from.findIndex((step) => step.id === currentId)
  for (let i = Math.max(position, 0); i >= 0; i--) {
    const found = to.findIndex((step) => step.id === from[i].id)
    if (found >= 0) return found
  }
  return 0
}

/** Remembered per device: once the guide was finished or skipped it does not open by itself again;
 *  it stays one tap away in the account menu. */
export const GUIDE_DONE_KEY = 'anitka:guide:v1'

export function shouldAutoStartGuide(stored: string | null | undefined): boolean {
  return stored !== 'done'
}

/** The step to show after moving `delta` cards, kept inside the guide (never before the first card or
 *  past the last one). */
export function clampStep(index: number, delta: number, total: number = GUIDE_STEPS.length): number {
  return Math.min(Math.max(index + delta, 0), total - 1)
}
