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
    text: 'Ráda vás poznám. Provedu vás celou aplikací od začátku do konce, tak jako bych stála vedle vás a ukazovala prstem. Projdu to stručně, ale nic důležitého nevynechám. Kdo chce o každé funkci vědět víc, klepne nahoře na „Podrobně“. A kdykoli řeknete stop, hned přestanu.',
  },
  {
    id: 'navigation',
    tab: 'Domů',
    mood: 'nod',
    title: 'Jak se tu pohybovat',
    text: 'Nejčastější věci jsou dole v liště: Domů, Nákup, Zásoby a Rozpočet. Všechno ostatní schovává tlačítko „Více“. Na počítači je celé menu vlevo, nic se neskrývá.',
    where: 'Na telefonu je lišta úplně dole. Pod „Více“ najdete Akce, Obchody, Recepty a Profil.',
    todo: ['Zkuste si klepnout na jakoukoli záložku. Nic se tím nepokazí, vždycky se můžete vrátit.'],
    target: [{ selector: '[data-guide-nav="Více"]' }],
    targetLabel: 'Tady je zbytek',
  },
  {
    id: 'home',
    tab: 'Domů',
    mood: 'smile',
    title: 'Domů: dnešní přehled',
    text: 'Tohle je nástěnka na lednici, jen chytřejší. Ukáže, kolik vám zbývá z rozpočtu, co je na nákupním seznamu, co máte dnes na jídelníčku a na které položky ze seznamu běží akce.',
    where: 'Najdete to dole v liště pod tlačítkem „Domů“.',
    todo: ['Nic psát nemusíte. Stačí se rozhlédnout a klepnout na to, co vás zajímá.', 'Čtveřice rychlých tlačítek (Do nákupu, Výdaj, Účtenka, Obchody) vás dostane k nejčastějším věcem na jedno klepnutí.'],
  },
  {
    id: 'bell',
    tab: 'Domů',
    mood: 'nod',
    title: 'Zvonek: dám vám vědět',
    text: 'Když se blížíte limitu rozpočtu, na něco z vašeho seznamu běží akce, vyjde nový leták, je potřeba zkontrolovat zásoby nebo zaplatit pravidelnou platbu, ozvu se přes zvonek nahoře. Na telefonu vám můžu poslat i oznámení.',
    where: 'Zvonek je vpravo nahoře, vedle vašeho kolečka s účtem.',
    todo: ['Klepněte na zvonek a přečtěte si, co se děje. Co nechcete slyšet, vypnete později v Profilu u „Upozornění“.'],
    target: [{ selector: 'button[aria-label^="Oznámení"]' }],
    targetLabel: 'Tady zvoním',
  },
  {
    id: 'shopping',
    tab: 'Nákup',
    mood: 'smile',
    title: 'Nákupní seznam: co máme koupit',
    text: 'Napište, co chybí, a já ke slovu nabídnu konkrétní produkty a druhy zboží, ať se to pak dobře hledá ve slevách. V obchodě pak odškrtáváte, jak věci házíte do košíku.',
    where: 'Najdete to pod tlačítkem „Nákup“, záložka „Nákupní seznam“.',
    todo: ['Napište třeba mléko a klepněte na „Přidat“.', 'V obchodě klepněte na kolečko vlevo u věci, kterou už máte.'],
    also: [
      'Klepnutím na řádek nastavíte množství, kategorii, obchod, prioritu a poznámku.',
      'Další seznamy (třeba „Vánoce“) a „Filtry a řazení“ pro dlouhé seznamy.',
    ],
    covers: ['shopping-detail', 'shopping-lists'],
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
    text: 'Každý řádek ukazuje název a kolik toho koupit. Když na řádek klepnete, rozbalí se: množství a jednotka, kategorie, preferovaný obchod, priorita, poznámka (třeba „bez laktózy“) a druh zboží. Když na položku běží akce, uvidíte u ní odznak s cenou a obchodem.',
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
    id: 'shopping-search',
    tab: 'Nákup',
    mood: 'think',
    title: 'Hledání produktů v obchodech',
    text: 'Chcete vědět, kolik co stojí jinde? Najdu produkt v obchodech, které máte nastavené, a ukážu ceny i cenu za kilo či litr, aby se dala srovnat různá balení. Jedním klepnutím ho přidáte na seznam a rovnou vyberete, který konkrétní produkt chcete koupit v jakém obchodě.',
    where: 'Nad seznamem je odkaz „Hledat produkty v obchodech“. Stejné hledání je i v detailu každé položky („Najít v obchodech“).',
    todo: ['Napište, co hledáte, a prohlédněte si ceny.', 'Klepnutím produkt přidáte na seznam.'],
    target: [{ selector: 'button', contains: 'Hledat produkty v obchodech' }],
    targetLabel: 'Tady hledejte',
  },
  {
    id: 'shopping-plan',
    tab: 'Nákup',
    mood: 'think',
    title: 'Plán nákupu: kde co koupit',
    text: 'Když máte na seznamu hodně věcí, spočítám, kde se vyplatí nakoupit. Řeknete mi, kolik obchodů jste ochotní projít a které preferujete, a já poskládám, co koupit kde, aby to vyšlo nejlevněji. A ukážu i to, kolik byste platili, kdybyste šli jen do jednoho obchodu.',
    where: 'Úplně dole pod seznamem, panel „Plán nákupu“.',
    todo: ['Zvolte počet obchodů a klepněte na „Sestavit plán“.', 'Po změně seznamu plán sestavte znovu. Poznáte to podle upozornění, že je neaktuální.'],
    // On an empty list the panel has no button yet, so the guide points at its heading instead.
    target: [{ selector: 'button', text: 'Sestavit plán' }, { selector: 'h3', text: 'Plán nákupu' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'shopping-finish',
    tab: 'Nákup',
    mood: 'cheer',
    title: 'Hotovo? Dokončete nákup',
    text: 'Až budete mít všechno v košíku a odškrtnuté, objeví se dole velké tlačítko „Dokončit nákup“. Odškrtnuté věci ze seznamu zmizí, ať máte čistý seznam na příště. Seznam jen připomíná, co koupit: nákup, výdaj v rozpočtu ani zásoby z něj nevzniknou. Ty se zapíšou z účtenky nebo ručně v „Moje nákupy“.',
    where: 'Tlačítko se ukáže dole nad lištou, jakmile něco odškrtnete.',
    todo: ['Odškrtněte, co jste koupili, a klepněte na „Dokončit nákup“.', 'Chcete mít nákup v rozpočtu a zásoby doma? Vyfoťte účtenku, nebo ho zadejte ručně.'],
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
    text: 'Nechce se vám nic psát? Vyfoťte účtenku nebo nahrajte fotku či PDF. Přečtu z ní obchod, datum i položky a vy jen zkontrolujete, jestli to sedí. Vznikne z toho nákup, výdaj v rozpočtu a doplní se zásoby. Když si u něčeho nejsem jistá, zeptám se.',
    where: 'V sekci „Nákup“ klepněte nahoře na „Účtenky“. Kolečko s číslem znamená, že na vás něco čeká.',
    todo: ['Klepněte na „Nahrát účtenku“ a vyfoťte ji celou, rovně a na světle.', 'Zkontrolujte rozpoznané položky a potvrďte.'],
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
    text: 'Tady vidíte, co máte ve spíži, lednici, mrazáku, v drogérce i jinde. Jakmile tu něco bude, uvidíte nahoře místa jako složky, a když si vlastní místo přejete (třeba „Kufr auta“), přidáte si ho v Profilu. Zásoby se plní samy z účtenek a z ručně zapsaných nákupů.',
    where: 'Najdete to pod tlačítkem „Zásoby“.',
    todo: ['Chybí tam něco, co doma máte? Klepněte na „Přidat“.', 'Až tu něco bude, klepněte na místo nahoře, třeba Lednice, a uvidíte, co v ní je.'],
    also: [
      'Fajfka = „ještě mám“, křížek = „došlo“, tužka změní množství a místo.',
      '„Zkontrolovat“: odhadnu, co došlo, a vy to potvrdíte.',
      'Minimum a maximum: až zásoba klesne a běží akce, poradím, co dokoupit.',
    ],
    covers: ['pantry-rows', 'pantry-check', 'pantry-levels'],
    target: [{ selector: 'section[aria-label^="Zásoby:"] button', text: 'Přidat' }],
    targetLabel: 'Tady přidáte zásobu',
  },
  {
    id: 'pantry-rows',
    detail: true,
    tab: 'Zásoby',
    mood: 'nod',
    title: 'Co udělat s položkou',
    text: 'U každé položky upravíte množství tlačítky − a +, nebo číslo přepíšete. Fajfka znamená „ještě mám“, křížek „došlo“. Přes tužku změníte kategorii, umístění nebo sledování: sůl a koření nemusím hlídat tak často jako mléko.',
    where: 'Napravo na každém řádku jsou fajfka, křížek a tužka.',
    todo: ['Klepněte na tužku u položky a podívejte se, co jde změnit.', 'Když položka došla, klepněte na křížek a zmizí ze zásob.'],
    target: [{ selector: 'button[aria-label^="Upravit: "]' }],
    targetLabel: 'Tužka = úpravy',
  },
  {
    id: 'pantry-check',
    detail: true,
    tab: 'Zásoby',
    mood: 'think',
    title: 'Kontrola zásob a odhad, co došlo',
    text: 'Zásoby se časem rozcházejí s realitou, tak se občas zeptám: „Máte to ještě?“ Podle toho, jak často věc kupujete, odhadnu i to, co asi došlo. Nahoře uvidíte „K ověření“ a jedním přehledem odškrtnete, co skutečně došlo. Zbytek potvrdím za vás.',
    where: 'Tlačítko „Zkontrolovat“ je nad seznamem položek. Týdenní upozornění vás tam pošle taky.',
    todo: ['Klepněte na „Zkontrolovat“ a označte jen to, co došlo.', 'U zbytku se nic dělat nemusí.'],
    target: [{ selector: 'section[aria-label^="Zásoby:"] button', contains: 'Zkontrolovat' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'pantry-levels',
    detail: true,
    tab: 'Zásoby',
    mood: 'wink',
    title: 'Hlídání minima a maxima',
    text: 'U věcí, které doma nesmí chybět, si nastavte minimum a maximum. Když zásoba klesne k minimu a v obchodě, který preferujete, se objeví zajímavá akce, řeknu vám, že je ten správný čas dokoupit, a spočítám kolik. Najdu tu nejlevnější.',
    where: 'U položky klepněte na tužku a v úpravách najdete „Hlídat zásobu“. Návrhy se pak objeví na Domů a štítkem „Dokoupit“.',
    todo: ['Zadejte minimum (kdy mám začít myslet na nákup) a maximum (kolik chcete mít nejvíc).', 'V Profilu v bloku „Moje obchody v okolí“ si zvolte prioritní obchody, ať vím, kam vás posílat.'],
    prepare: { selector: 'button[aria-label^="Upravit: "]' },
    target: [{ selector: 'input[aria-label^="Minimum "]' }],
    targetLabel: 'Sem zadejte minimum',
  },
  {
    id: 'budget',
    tab: 'Rozpočet',
    mood: 'smile',
    title: 'Rozpočet: kam mizí peníze',
    text: 'Nastavíte si, kolik chcete za období utratit, a já vám dám vědět na 80 % i 100 %, než se dostanete na konec. V Přehledu uvidíte, kolik už je utraceno, kolik zbývá a kam peníze šly.',
    where: 'Najdete to pod tlačítkem „Rozpočet“, záložka „Přehled“.',
    todo: ['Klepněte na „Nastavit rozpočet“ a napište částku.', 'Podívejte se, jak vám vychází konec období.'],
    also: [
      'Výdaje: ručně nebo z účtenky, opravit či smazat jde kdykoli.',
      'Plánování: příjmy a plánované výdaje, spočítám, kolik opravdu zbude.',
      'Pravidelné platby: nájem, předplatné, v den splatnosti připomenu.',
      'Kapsy: spoření na cíle, třeba dovolenou.',
      'Konec období: uzavřete ho a rozhodnete, co s přebytkem či schodkem.',
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
    text: 'Tady se dívám dopředu. Zapíšete očekávané příjmy (výplatu) a plánované výdaje (dovolená, oprava auta) a já spočítám, kolik vám opravdu zbude. Skutečné peníze jsou to, co už se stalo, plánované to, co teprve přijde.',
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
    todo: ['Přidejte platbu, částku, jak často se opakuje a první splatnost.', 'V den splatnosti ji potvrďte, nebo přeskočte.'],
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
    text: 'Slevy z letáků na jednom místě. U každé vám ukážu cenu za kilo nebo litr a řeknu, jestli je to opravdu nejlepší cena, a ne jen velké číslo v procentech. Můžete filtrovat podle obchodu a kategorie. Zapnutím „Pro mě“ uvidíte jen to, co odpovídá vašim oblíbeným značkám a produktům.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Akce“.',
    todo: ['Napište, co hledáte, nebo si jen listujte.', 'Něco se vám líbí? Klepněte na „Na seznam“.'],
    target: [{ selector: 'input[aria-label="Hledat v akcích"]' }],
    targetLabel: 'Sem napište, co hledáte',
  },
  {
    id: 'stores',
    tab: 'Obchody',
    mood: 'think',
    title: 'Obchody: prodejny ve vašem městě',
    text: 'Napište své město a ukážu vám prodejny jednotlivých řetězců, kde jsou a jak daleko od vás. Hodí se, když si chcete vybrat, kam se vám vyplatí zajít, nebo když jedete někam, kde to neznáte.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Obchody“.',
    todo: ['Napište své město, třeba Brno, a prohlédněte si prodejny.', 'Které řetězce opravdu navštěvujete, nastavíte v Profilu (o kousek dál).'],
    target: [{ selector: 'input[aria-label="Lokalita"]' }],
    targetLabel: 'Sem napište město',
  },
  {
    id: 'recipes',
    tab: 'Recepty',
    mood: 'smile',
    title: 'Recepty: co dnes vaříme',
    text: 'Nevíte, co k večeři? Poradím podle toho, co máte doma. Recepty jde taky hledat, otevřít, upravit počet porcí a suroviny, které chybí, přidat jedním klepnutím na nákupní seznam. Co se vám líbí, uložíte do Oblíbených a historie ukáže, co jste naposledy otevřeli.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Recepty“.',
    todo: ['Klepněte na „Navrhnout recepty“.', 'Co se vám líbí, otevřete a suroviny přidejte na seznam.'],
    prepare: { selector: '[role="group"][aria-label="Recepty"] button', text: 'Recepty' },
    target: [{ selector: 'button', text: 'Navrhnout recepty' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'mealplan',
    tab: 'Recepty',
    mood: 'cheer',
    title: 'Jídelníček: plán na týden',
    text: 'Nechcete každý den přemýšlet? Dám dohromady jídelníček na celý týden. Počítám s tím, co kdo jí a nesmí, i s tím, co máte v zásobách, takže chybějící suroviny skočí na seznam jedním klepnutím. Dnešní jídlo pak uvidíte i na Domů.',
    where: 'Na telefonu klepněte dole na „Více“, pak na „Recepty“ a nahoře na záložku „Jídelníček“.',
    todo: ['Klepněte na „Vytvořit jídelníček“.', 'Suroviny, které doma chybí, přidejte na seznam.'],
    prepare: { selector: '[role="group"][aria-label="Recepty"] button', text: 'Jídelníček' },
    target: [{ selector: 'button', text: 'Vytvořit jídelníček' }, { selector: 'button', text: 'Vytvořit nový jídelníček' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'profile',
    tab: 'Profil',
    mood: 'cheer',
    title: 'Profil: to nejdůležitější!',
    text: 'Mám jednu velkou prosbu: vyplňte profil domácnosti. Čím víc o vás vím, tím líp poradím. Bez něj hádám naslepo.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Profil“.',
    why: [
      'Alergie a věci, které nejíte: nic nevhodného nenavrhnu.',
      'Kolik vás je a kolik je dětem: poradím správná množství i jídla pro děti.',
      'Oblíbené značky a obchody: ukážu jen slevy, které se vás týkají.',
    ],
    todo: ['Zkontrolujte název domácnosti.', 'Přidejte členy domácnosti a děti (věk, alergie, co nejí).', 'Vyberte oblíbené značky a obchody.'],
    also: [
      'Členové a děti: stravování, alergie, věk. Pozvaní dospělí sdílejí seznam, zásoby i rozpočet (změny druhých vidíte po obnovení stránky).',
      'Moje obchody v okolí: kam chodíte, prioritní obchody a kolik jich projít.',
      'Nákupní preference: oblíbené značky a produkty, i co nekupovat.',
      'Upozornění: vyberete, která chcete; tady jsou i vlastní místa pro zásoby.',
    ],
    covers: ['profile-members', 'profile-stores', 'profile-preferences', 'profile-notifications'],
    target: [{ selector: '[data-guide="household-name"]' }],
    targetLabel: 'Začněte jménem domácnosti',
  },
  {
    id: 'profile-members',
    detail: true,
    tab: 'Profil',
    mood: 'smile',
    title: 'Členové, děti a pozvánky',
    text: 'U každého člena nastavíte způsob stravování, alergie a co nejí. U dětí věk a zvláštní potřeby. Další dospělé pozvete e-mailem a ti pak uvidí a upravují stejný nákupní seznam, zásoby i rozpočet. Změny druhých se ale ukážou až po obnovení stránky.',
    where: 'V Profilu nahoře je „Členové domácnosti“ a pod ním „Děti“.',
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
    where: 'V Profilu otevřete blok „Moje obchody v okolí“.',
    todo: ['Zaškrtněte řetězce, které máte poblíž.', 'Volitelně označte prioritní obchody a kolik jich chcete projít.'],
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
    where: 'V Profilu otevřete blok „Nákupní preference domácnosti“.',
    todo: ['Vyplňte pár oblíbených značek a produktů.', 'Do „Produkty, které nekupovat“ napište, čemu se chcete vyhnout.'],
    target: [{ selector: 'section button', contains: 'Nákupní preference domácnosti' }],
    targetLabel: 'Preference',
  },
  {
    id: 'profile-notifications',
    detail: true,
    tab: 'Profil',
    mood: 'think',
    title: 'Upozornění a nastavení zásob',
    text: 'Tady si vyberete, která upozornění chcete: rozpočet, akce na seznamu, připomínka nákupu, kontrola zásob, splatné platby. Ostatním členům se tím nic nemění. Najdete tu i vlastní místa pro zásoby a to, jak často se mám ptát, jestli věc ještě máte.',
    where: 'V Profilu otevřete blok „Upozornění“ a níže nastavení zásob.',
    todo: ['Vypněte upozornění, která nechcete.', 'Na telefonu zapněte oznámení, ať vám nic neuteče.'],
    target: [{ selector: 'section button', contains: 'Upozornění' }],
    targetLabel: 'Upozornění',
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
      title: 'Poradím s čímkoliv',
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

// The very last card shows exactly where to find the guide again: the account menu, opened and with its
// "Průvodce aplikací" item highlighted. `skipIf` keeps a menu that is already open (coming back to this
// card) from being closed by the click that opens it.
const FIND_ME_STEP: GuideStep = {
  id: 'findme',
  tab: 'Domů',
  mood: 'wink',
  title: 'A kdybyste na něco zapomněli',
  text: 'To je celé! Kdykoli budete potřebovat připomenout, jak něco funguje, spusťte mě znovu. Ukážu to celé od začátku a nic se tím nezmění. Taky to klidně projděte jen zčásti a vraťte se, až budete mít chuť.',
  where: 'Klepněte vpravo nahoře na své kolečko s iniciálou, otevře se nabídka účtu a v ní je „Průvodce aplikací“.',
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
  return [...BASE_STEPS, anitkaStep(aiEnabled), FIND_ME_STEP]
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
