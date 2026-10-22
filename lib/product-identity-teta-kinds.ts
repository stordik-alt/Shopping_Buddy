/**
 * The words that name *what a product is* — the type of the product, not the variant of it.
 *
 * A retailer writes a product name differently from another retailer: one says "Always Ultra
 * Secure Night Extra hygienické vložky s křidélky, velikost 5", the other "always vložky Ultra
 * Secure Night Extra s křidélky". The type words ("vložky", "hygienické") are the words the second
 * name simply leaves out, and they are never the word that tells two products of one line apart —
 * that word is the variant ("Night", "Secure", "Extra", the shade, the flavour, the size).
 *
 * Two rules use this vocabulary:
 *
 *   * a type word may be missing from the other name — the catalog is allowed to name the product
 *     by its line alone ("Nivea Creme 200 ml" ↔ "Nivea 200 ml");
 *   * the types both names state have to be compatible — "Nivea Creme" and "Nivea Deodorant" are
 *     two products, whatever else they share.
 *
 * The list is deliberately short and hand-picked. A word belongs here only when every product of
 * that type carries it in one spelling or another, so that a missing word is a naming habit and
 * not a difference. Words that narrow a product are *not* here: "dětská" (kids' paste is not
 * paste), "noční" (a night pad is not a pad), "černá" (a black shade is not a shade), "bio",
 * "intenzivní", "mája", "vanilka". Those are variants, and a variant that only one name states is
 * exactly what the matching has to catch.
 *
 * The words are in the normalized form the matchers compare (lower case, no diacritics). The forms
 * of a word are not listed one by one: the matcher reduces a word to its stem
 * (`searchStem()`, lib/product-search.ts) before it looks it up, so "kremu" is found as "krem".
 */

import { searchStem } from '@/lib/product-search'

/**
 * The type words, one group per type. The words of a group are the same type written differently
 * ("krem" / "creme" / "cream"), so a name that uses one of them states the same type as a name
 * that uses another.
 */
const KIND_GROUPS: string[][] = [
  // --- drogerie: the product itself ---
  ['krem', 'creme', 'cream'],
  ['gel'],
  ['samp', 'sampon', 'shampoo'],
  ['kondicioner', 'conditioner'],
  ['balzam', 'balm'],
  ['maska', 'mask'],
  ['serum', 'sera'],
  ['tonikum', 'tonic', 'tonika'],
  ['lak', 'laku'],
  ['pudr', 'pudru', 'powder'],
  ['rtenka', 'rtenky', 'mascara'],
  ['tuzka', 'tuzky', 'pencil'],
  ['korektor', 'korektory'],
  ['linka', 'linky'],
  ['makeup'],
  ['bronz', 'bronzer'],
  ['blush'],
  ['sprej', 'spreje', 'spray'],
  ['mist'],
  ['pena', 'peny'],
  ['mydlo', 'mydla'],
  ['dezinfekce', 'dezinfekcni'],
  ['kartacek', 'kartackove', 'kartacku'],
  ['hlavy', 'hlavice'],
  ['nit', 'niti'],
  ['paratka', 'paratky'],
  ['ubrousky', 'ubrousk', 'ubrousek'],
  ['vlozky', 'vlozka', 'vlozek'],
  ['hygienicke'],
  ['kondomy', 'kondom'],
  ['tycinka', 'tycinky', 'tycink'],
  ['tampon', 'tampony'],
  ['naplasti', 'naplast'],
  ['vata', 'vaty', 'vatove', 'vaticky'],
  ['podlozky'],
  ['deodorant'],
  ['antiperspirant'],
  ['parfem', 'parfum'],
  ['voda'],
  ['set', 'sada'],
  ['lepidlo', 'glue'],
  ['baterie', 'baterka'],
  ['kelimek'],
  ['hrnek'],
  ['sklenice'],
  ['flakon'],
  ['pasky'],
  ['epilator'],
  ['respirator'],
  ['chranice'],
  ['zrcatko'],
  ['brzy'],
  ['pyrek'],
  ['hoblik'],
  ['elixir'],
  ['peeling', 'scrub'],
  ['pastilky'],
  ['tablety'],
  ['kapsle', 'kapsli'],
  ['kapky'],
  ['prask'],
  ['emulze'],
  ['tonik'],

  // --- grocery: the product itself ---
  ['mleko'],
  ['jogurt'],
  ['syr'],
  ['maso'],
  ['pecivo'],
  ['susenky', 'susenka'],
  ['cokolada'],
  ['kava'],
  ['caj'],
  ['mouka'],
  ['cukr'],
  ['sul'],
  ['ryze'],
  ['testoviny'],
  ['omacka'],
  ['polevka'],
  ['kecup'],
  ['horcice'],
  ['majoneza'],
  ['med'],
  ['maslo'],
  ['olej'],
  ['konzerva'],
  ['susina'],
  ['tresky'],
  ['tuna'],
  ['losos'],
  ['granule'],
  ['vlocky'],
  ['guma'],
  ['cukrika'],
  ['bonbon'],
  ['karamel'],
  ['zalkost'],
  ['sladidlo'],
  ['napoj'],
  ['mineralni'],
]

/** The type of every word of a group, reduced to its stem. */
const KIND_OF_WORD = new Map<string, number>()
KIND_GROUPS.forEach((group, index) => {
  for (const word of group) {
    KIND_OF_WORD.set(searchStem(word), index)
  }
})

/**
 * The type a word names, or `null` when the word does not name a type.
 *
 * The word is reduced to its stem first, so the forms of one word ("vložky", "vložka") are found
 * by one entry.
 */
export function productKindOf(word: string): number | null {
  const kind = KIND_OF_WORD.get(searchStem(word))
  return kind === undefined ? null : kind
}

/** Whether the word names a type of product. */
export function isProductKindWord(word: string): boolean {
  return productKindOf(word) !== null
}

/**
 * Whether the types two names state can be the same product.
 *
 * The types have to be compatible: one name may say more than the other ("hygienické vložky"
 * against "vložky"), but they may not say different ones ("vložky" against "ubrousky"). A name that
 * states no type at all says nothing about the type, so it is compatible with every type.
 */
export function productKindsCompatible(left: number[], right: number[]): boolean {
  if (left.length === 0 || right.length === 0) return true
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const leftCoversRight = right.every((kind) => leftSet.has(kind))
  const rightCoversLeft = left.every((kind) => rightSet.has(kind))
  return leftCoversRight || rightCoversLeft
}
