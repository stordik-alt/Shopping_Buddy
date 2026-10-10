import { describe, expect, it } from 'vitest'
import { classifyProductType } from '@/lib/product-types'
import type { ItemCategory } from '@/lib/types'

// Rules for the seed-proposal types promoted to code (docs/12, 2026-10-seed-v1): caj, vino, lihoviny,
// cokolada-tabulkova, chipsy-snacky, mydlo, deodoranty. The names are written in the style of real
// receipt/catalog names but are NOT yet measured on the production catalog (it was unreachable when
// the rules were written); every miss found there should be added here first.
const CASES: [ItemCategory, string, string | null][] = [
  // Čaj
  ['Potraviny', 'Pickwick Černý čaj Earl Grey 20 sáčků', 'caj'],
  ['Potraviny', 'Teekanne Zelený čaj 20x1,75g', 'caj'],
  ['Potraviny', 'Čaj bylinný heřmánek 30 g', 'caj'],
  ['Potraviny', 'Nestea Ledový čaj broskev 1,5l', null],
  ['Potraviny', 'Ledový čaj citron 0,5l', null],
  ['Potraviny', 'Mattoni Kombucha zázvor', null],
  ['Potraviny', 'Čajové sušenky máslové 200g', null],
  ['Potraviny', 'Hrnek na čaj', null],
  // Víno
  ['Potraviny', 'Frankovka víno červené suché 0,75l', 'vino'],
  ['Potraviny', 'Bílé víno Müller Thurgau polosuché 0,75 l', 'vino'],
  ['Potraviny', 'Prosecco DOC Extra Dry 0,75l', 'vino'],
  ['Potraviny', 'Svařené víno 1l', null],
  ['Potraviny', 'Víno nealkoholické 0,75l', null],
  ['Potraviny', 'Hroznové víno bílé bezsemenné', null],
  ['Potraviny', 'Vinařství Znovín dárková taška', null],
  ['Potraviny', 'Ocet z vína červený 0,5l', null],
  // Lihoviny
  ['Potraviny', 'Finlandia Vodka 40% 0,7l', 'lihoviny'],
  ['Potraviny', 'Jameson Irish Whiskey 0,7l', 'lihoviny'],
  ['Potraviny', 'Božkov Tuzemský rum 37,5% 0,5l', 'lihoviny'],
  ['Potraviny', 'Rumové aroma 10 ml', null],
  ['Potraviny', 'Becherovka Original 38% 0,5l', 'lihoviny'],
  // Čokoláda tabulková
  ['Potraviny', 'Milka Mléčná čokoláda 100g', 'cokolada-tabulkova'],
  ['Potraviny', 'Orion Hořká čokoláda 70% 80 g', 'cokolada-tabulkova'],
  ['Potraviny', 'Čokoláda s lískovými ořechy 100g', 'cokolada-tabulkova'],
  ['Potraviny', 'Čokoláda na vaření 100g', null],
  ['Potraviny', 'Horká čokoláda instantní 150g', null],
  ['Potraviny', 'Čokoládová pomazánka 400g', null],
  ['Potraviny', 'Čokoládové kapky na pečení', null],
  // Chipsy
  ['Potraviny', 'Bohemia Chips bramborové solené 140g', 'chipsy-snacky'],
  ['Potraviny', 'Chipsy zeleninové z červené řepy 80g', 'chipsy-snacky'],
  ['Potraviny', 'Bohemia Chipsy čočkové mořská sůl 65g', null],
  ['Potraviny', 'Tortilla chips nachos 200g', null],
  ['Potraviny', 'Dip na chipsy sýrový 200g', null],
  // Mýdlo
  ['Drogerie', 'Tuhé mýdlo Dove 100g', 'mydlo'],
  ['Drogerie', 'Tekuté mýdlo Palmolive náplň 500ml', 'mydlo'],
  ['Drogerie', 'Žlučové mýdlo na skvrny', null],
  ['Drogerie', 'Mýdlenka plastová', null],
  ['Děti', 'Dětské mýdlo Bambino', 'detske-mydlo'],
  // Deodorant
  ['Drogerie', 'Nivea Men Deodorant sprej 150ml', 'deodoranty'],
  ['Drogerie', 'Rexona Antiperspirant roll-on 50ml', 'deodoranty'],
  ['Drogerie', 'Deo roll-on Dove 50 ml', 'deodoranty'],
  ['Drogerie', 'Deodorant do bot 150ml', null],
  ['Drogerie', 'Osvěžovač WC deo', null],
]

describe('seed-proposal types promoted to code', () => {
  it.each(CASES)('%s: %s → %s', (category, name, type) => {
    expect(classifyProductType(category, name)).toBe(type)
  })
})
