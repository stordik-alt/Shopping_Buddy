import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import type { Tab } from '@/lib/types'

// Content and rules of Anitka's guided tour (docs/22_GUIDE.md). Kept apart from the component so the
// steps can be tested and edited without touching UI code. Anitka is a little girl talking to a
// family: the wording is short, warm and plain (one idea per card, no feature jargon, a little humour),
// and never sounds like a manual.

/** A real element of the app the guide points at. Found by CSS selector; when `text` is given, only
 *  an element whose visible text is exactly that counts (several buttons share a selector). */
export type GuideTarget = { selector: string; text?: string }

export type GuideStep = {
  id: string
  /** The section opened behind the guide while this card is shown. */
  tab: Tab
  title: string
  /** One or two short sentences: what this part of the app is for. */
  text: string
  /** Where to find the section, in one short line. */
  where?: string
  /** "Co udělat": the few things the person actually has to do here. */
  todo?: string[]
  /** "Proč na tom záleží": reasons shown as a short list (the profile step). */
  why?: string[]
  /** Something to click first so the card is about the right part of the section (e.g. the
   *  "Jídelníček" switch inside Recepty). */
  prepare?: GuideTarget
  /** Where to act in the section: the first candidate that is on screen gets the highlight. A step
   *  without a visible target (or with a section that shows something else, e.g. an empty state)
   *  simply highlights the section's entry in the navigation. */
  target?: GuideTarget[]
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
    title: 'Ahoj, já jsem Anitka!',
    text: 'Ukážu vám, co tu kde je. Půjdeme pěkně po jedné kartičce, nic složitého. A kdykoli můžete říct stop.',
  },
  {
    id: 'home',
    tab: 'Domů',
    title: 'Domů: dnešní přehled',
    text: 'Tady uvidíte, co je dnes potřeba. Jako nástěnka na lednici, jen chytřejší.',
    where: 'Najdete to dole v liště pod tlačítkem „Domů“.',
    todo: ['Nic psát nemusíte. Stačí se rozhlédnout a klepnout na to, co vás zajímá.'],
  },
  {
    id: 'shopping',
    tab: 'Nákup',
    title: 'Nákup: co máme koupit',
    text: 'Tohle je váš nákupní seznam. Napište, co chybí, a v obchodě to odškrtáváte, jak věci házíte do košíku.',
    where: 'Najdete to pod tlačítkem „Nákup“.',
    todo: ['Napište třeba mléko a klepněte na „Přidat“.', 'V obchodě klepnutím odškrtněte, co už máte v košíku.'],
    target: [{ selector: 'input[aria-label="Nová položka"]' }],
    targetLabel: 'Sem napište, co chybí',
  },
  {
    id: 'pantry',
    tab: 'Zásoby',
    title: 'Zásoby: co je doma',
    text: 'Tady si zapíšete, co máte ve spíži a v lednici. Aby vám doma nevyrostly tři balení rýže.',
    where: 'Najdete to pod tlačítkem „Zásoby“.',
    todo: ['Klepněte na „Přidat“ a napište, co doma máte (třeba vejce).', 'Občas mi řekněte, co už došlo.'],
    target: [{ selector: 'section[aria-label^="Zásoby:"] button', text: 'Přidat' }],
    targetLabel: 'Tady přidáte zásobu',
  },
  {
    id: 'budget',
    tab: 'Rozpočet',
    title: 'Rozpočet: kam mizí peníze',
    text: 'Nastavíte si, kolik chcete za měsíc utratit, a já vám dám vědět, než se dostanete na konec.',
    where: 'Najdete to pod tlačítkem „Rozpočet“. Rozpočet se nastavuje tady, v záložce „Plánování“.',
    todo: ['Klepněte na „Nastavit rozpočet“ a napište částku.', 'Po nákupu zapište, kolik jste utratili.'],
    target: [{ selector: 'button', text: 'Nastavit rozpočet' }, { selector: 'button', text: 'Přidat výdaj' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'deals',
    tab: 'Akce',
    title: 'Akce: kde je levněji',
    text: 'Slevy z letáků na jednom místě. U každé vám ukážu cenu za kilo nebo litr, ať poznáte, co se opravdu vyplatí.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Akce“.',
    todo: ['Napište, co hledáte, nebo si jen listujte.', 'Něco se vám líbí? Klepněte na „Na seznam“.'],
    target: [{ selector: 'input[aria-label="Hledat v akcích"]' }],
    targetLabel: 'Sem napište, co hledáte',
  },
  {
    id: 'stores',
    tab: 'Obchody',
    title: 'Obchody: kam chodíte',
    text: 'Řekněte mi, které obchody máte poblíž. Pak vám nebudu nabízet slevy, kvůli kterým byste museli ujet půl kraje.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Obchody“.',
    todo: ['Napište své město a vyberte obchody, kam chodíte.'],
    target: [{ selector: 'input[aria-label="Lokalita"]' }],
    targetLabel: 'Sem napište město',
  },
  {
    id: 'recipes',
    tab: 'Recepty',
    title: 'Recepty: co dnes vaříme',
    text: 'Nevíte, co k večeři? Poradím podle toho, co máte doma. Stačí klepnout a já navrhnu.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Recepty“.',
    todo: ['Klepněte na „Navrhnout recepty“.', 'Co se vám líbí, otevřete a suroviny přidejte na seznam.'],
    prepare: { selector: '[role="group"][aria-label="Recepty"] button', text: 'Recepty' },
    target: [{ selector: 'button', text: 'Navrhnout recepty' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'mealplan',
    tab: 'Recepty',
    title: 'Jídelníček: plán na týden',
    text: 'Nechcete každý den přemýšlet? Dám dohromady jídelníček na celý týden a suroviny skočí na seznam jedním klepnutím.',
    where: 'Na telefonu klepněte dole na „Více“, pak na „Recepty“ a nahoře na záložku „Jídelníček“.',
    todo: ['Klepněte na „Vytvořit jídelníček“.', 'Suroviny, které doma chybí, přidejte na seznam.'],
    prepare: { selector: '[role="group"][aria-label="Recepty"] button', text: 'Jídelníček' },
    target: [{ selector: 'button', text: 'Vytvořit jídelníček' }, { selector: 'button', text: 'Vytvořit nový jídelníček' }],
    targetLabel: 'Sem klepněte',
  },
  {
    id: 'profile',
    tab: 'Profil',
    title: 'Profil: to nejdůležitější!',
    text: 'Mám jednu velkou prosbu: vyplňte profil domácnosti. Čím víc o vás vím, tím líp poradím. Bez něj hádám naslepo.',
    where: 'Na telefonu klepněte dole na „Více“ a pak na „Profil“.',
    why: [
      'Alergie a věci, které nejíte: nic nevhodného nenavrhnu.',
      'Kolik vás je a kolik je dětem: poradím správná množství i jídla pro děti.',
      'Oblíbené značky a obchody: ukážu jen slevy, které se vás týkají.',
    ],
    todo: ['Zkontrolujte název domácnosti.', 'Přidejte členy domácnosti a děti (věk, alergie, co nejí).', 'Vyberte oblíbené značky a obchody.'],
    target: [{ selector: '[data-guide="household-name"]' }],
    targetLabel: 'Začněte jménem domácnosti',
  },
]

// The last card is about Anitka herself, the assistant. While the assistant is not switched on
// (lib/features.ts) there is nothing to open, so the card says honestly that she is still learning
// instead of promising answers; switched on, it points at her screen and offers to open it.
function anitkaStep(aiEnabled: boolean): GuideStep {
  const secondaryCta = { label: 'Nejdřív vyplnit profil', tab: 'Profil' } as const
  if (aiEnabled) {
    return {
      id: 'anitka',
      tab: 'AI',
      title: 'Poradím s čímkoliv',
      text: 'Kdykoli si se mnou můžete popovídat. Zeptejte se na nákup, slevy nebo večeři a já poradím.',
      where: 'Najdete mě v nabídce „AI asistent“. Na telefonu klepněte dole na „Více“.',
      todo: ['Napište mi, co potřebujete, třeba „nákup na týden do 2 500 Kč“.'],
      target: [{ selector: 'input[placeholder^="Např. nákup na týden"]' }],
      targetLabel: 'Sem se mě zeptejte',
      cta: { label: 'Otevřít Anitku', tab: 'AI' },
      secondaryCta,
    }
  }
  return {
    id: 'anitka',
    tab: 'Domů',
    title: 'Brzy si budeme povídat',
    text: 'Ještě se učím. Jednou vám budu umět poradit s čímkoliv kolem nákupů a vaření a najdete mě tady v aplikaci. Zatím mi nejvíc pomůže váš vyplněný profil.',
    cta: { label: 'Hotovo' },
    secondaryCta,
  }
}

/** The tour's cards. The last one depends on whether the AI assistant is switched on. */
export function getGuideSteps(aiEnabled: boolean): readonly GuideStep[] {
  return [...BASE_STEPS, anitkaStep(aiEnabled)]
}

export const GUIDE_STEPS = getGuideSteps(AI_ASSISTANT_ENABLED)

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
