// Suggesting which catalog product a receipt line is (docs/08_OCR_RECEIPT_PIPELINE.md section 7).
//
// A receipt prints a shortened, upper-case name ("ALB TOUS.CHL. SV.250G", "PHILADELP.NATUR 125G"),
// while the catalog holds the retailers' full names ("Albert Toustový chléb světlý 250 g"). Comparing
// the two whole strings by edit distance (lib/categorization.ts's fuzzy tier) cannot bridge that, so
// this module compares word by word: each receipt word, with known abbreviations spelled out, must be
// the start of a word of the product's name, and the package size, when both state one, must agree.
//
// Only *suggestions* come out of this: the household confirms one during review, and only that
// confirmation links the line to the product and teaches a store-specific alias (lib/receipt-import.ts).
// A suggestion is pre-selected only when it is clearly the one (`confident`); it is never applied to a
// purchase without the household seeing it. Pure and deterministic — the database side, which finds
// the candidates, is lib/db/receipt-candidates.ts.

/** Abbreviations the chains print on receipts, spelled out. Keys and values are accent-free and lower
 *  case (the form `receiptWords()` produces). An empty value drops the word: it only says which chain
 *  or which unit, never what the product is. Kept short and conservative — a wrong expansion is worse
 *  than none, since the unexpanded word still matches as a word start. */
export const RECEIPT_ABBREVIATIONS: Readonly<Record<string, string>> = {
  ks: '',
  angl: 'anglicka',
  bil: 'bile',
  chl: 'chleb',
  coko: 'cokoladovy',
  hladk: 'hladka',
  hov: 'hovezi',
  jah: 'jahoda',
  kaps: 'kapsicka',
  krup: 'krupice',
  kur: 'kureci',
  odk: 'odkolek',
  pod: 'podestylky',
  podest: 'podestylky',
  polotuc: 'polotucne',
  prich: 'prichut',
  prs: 'prsni',
  pribin: 'pribinacek',
  sleh: 'slehacka',
  smet: 'smetana',
  ster: 'sterilovane',
  sv: 'svetly',
  tous: 'toustovy',
  trv: 'trvanlive',
  vep: 'veprove',
  vit: 'vitana',
  zak: 'zakysana',
}

/** A chain's own brand as its receipts print it ("ALB LISTO.TĚSTO" is Albert's own puff pastry). Not
 *  a word the product must contain — the catalog often names the product without it — but a product
 *  of that brand ranks first. */
const OWN_BRANDS: Readonly<Record<string, string>> = { alb: 'albert', albert: 'albert', billa: 'billa', lidl: 'lidl', penny: 'penny', kaufland: 'kaufland' }

/** Letters OCR returns in place of Czech ones on Albert's receipts ("VIT. ĄESNEK", "POMERÁNĀE",
 *  "VIT.MEDVĘDÍ"). Fixed before accents are stripped, so "ąesnek" reads "cesnek", not "aesnek". */
const OCR_CONFUSABLES: Readonly<Record<string, string>> = { Ą: 'Č', ą: 'č', Ā: 'Č', ā: 'č', Ę: 'Ě', ę: 'ě', İ: 'I', ı: 'i', Ÿ: 'Ý', ÿ: 'ý' }

function plainText(text: string): string {
  let fixed = ''
  for (const char of text) fixed += OCR_CONFUSABLES[char] ?? char
  return fixed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // "ROHLÍK43GR", "UZENÁ20G": a size glued to the word before it.
    .replace(/([a-z])(\d)/g, '$1 $2')
}

/** "1,51" on a receipt is "1,5l" with the l read as a one ("Voda les.plody1,51", "Ice tea 0,51").
 *  Only a one directly after a decimal digit at the end of a word is taken for an l. */
function fixLitreOcr(text: string): string {
  return text.replace(/(\d[.,]\d)1(?=$|[^a-z0-9])/g, '$1l')
}

// An optional "6 x" / "8×" in front counts the pieces of a multipack.
const SIZE_PATTERN = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|l)(?=$|[^a-z])/g
const GRAMS_PER_UNIT: Readonly<Record<string, number>> = { kg: 1000, gr: 1, g: 1, l: 1000, ml: 1 }

/** The package size a name states, in grams or millilitres (the two are compared as one scale; a
 *  receipt never mixes them for one product) — a multipack's whole contents, so "6x1,5l" is not the
 *  1,5 l bottle. The last size wins: "GUS KY.ZELÍ 670/360G" states the drained weight last. Null when
 *  the name states none. */
export function packageSize(name: string): number | null {
  const text = fixLitreOcr(plainText(name))
  let size: number | null = null
  for (const match of text.matchAll(SIZE_PATTERN)) size = (match[1] ? Number(match[1]) : 1) * Number(match[2].replace(',', '.')) * GRAMS_PER_UNIT[match[3]]
  return size
}

/** The words of a receipt line that say what the product is, abbreviations spelled out: sizes,
 *  numbers and codes ("L10", "1R/2V") and the chain's own name are dropped. */
export function receiptWords(name: string): string[] {
  const text = fixLitreOcr(plainText(name)).replace(SIZE_PATTERN, ' ')
  const words: string[] = []
  for (const word of text.split(/[^a-z0-9]+/)) {
    if (!word || /\d/.test(word) || word in OWN_BRANDS) continue
    const expanded = word in RECEIPT_ABBREVIATIONS ? RECEIPT_ABBREVIATIONS[word] : word
    if (expanded.length >= 2 && !words.includes(expanded)) words.push(expanded)
  }
  return words
}

/** Further abbreviations that only matter for telling the *kind* of goods — its product type
 *  (docs/12_PRODUCT_TYPES.md phase 4) and its subcategory (lib/categorization.ts classifySubcategory): the words the product-type rules look for, as receipts print them ("KUR.PRSA",
 *  "MLETE VEP.", "KRUT.STEHNA"). Same form as RECEIPT_ABBREVIATIONS; kept apart because matching a
 *  line against catalog names must not expand these (it would only lose the prefix match). */
const TYPE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  kurec: 'kureci',
  krut: 'kruti',
  mlet: 'mlete',
  mas: 'maso',
  stehn: 'stehna',
  krid: 'krida',
  plnotuc: 'plnotucne',
  rohl: 'rohlik',
  jogur: 'jogurt',
  // Seen on real receipts (2026-10-06): "LINTEO BABY UBR.72KS", "SPX HOUB.MEGAMAX", "Zewa kuch. role",
  // "ČESNEK.POMAZ.SE SÝR.", "MAT.BILE HROZNY 1,5L" (Albert's Mattoni).
  ubr: 'ubrousky',
  houb: 'houbicky',
  kuch: 'kuchynske',
  pomaz: 'pomazanka',
  mat: 'mattoni',
}

/** A receipt line as text the product-type rules (lib/product-types.ts) can read: accents and OCR
 *  confusions fixed, glued sizes split, and the abbreviations above and in RECEIPT_ABBREVIATIONS
 *  spelled out. Unlike `receiptWords` it keeps numbers and "ks" — a rule may need them (avocado is
 *  only a type when sold by the piece). Used only to classify, never to store. */
export function receiptTypeText(name: string): string {
  const words: string[] = []
  for (const word of fixLitreOcr(plainText(name)).split(/[^a-z0-9]+/)) {
    if (!word || word in OWN_BRANDS) continue
    if (word in TYPE_ABBREVIATIONS) words.push(TYPE_ABBREVIATIONS[word])
    else if (word in RECEIPT_ABBREVIATIONS && RECEIPT_ABBREVIATIONS[word] !== '') words.push(RECEIPT_ABBREVIATIONS[word])
    else words.push(word)
  }
  return words.join(' ')
}

/** The chain whose own brand the line names ("ALB …" → "albert"), or null. */
export function receiptOwnBrand(name: string): string | null {
  for (const word of plainText(name).split(/[^a-z0-9]+/)) if (word in OWN_BRANDS) return OWN_BRANDS[word]
  return null
}

/** Whether the receipt word `word` names the product word `productWord`: the same word, or its start
 *  ("philadelp" → "philadelphia"), or — for a word long enough not to be ambiguous — its start with
 *  one OCR-damaged letter ("bavany" → "banany"). */
function wordMatches(word: string, productWord: string): 'exact' | 'prefix' | null {
  if (word === productWord) return 'exact'
  if (productWord.startsWith(word)) return 'prefix'
  if (word.length >= 5 && productWord.length >= word.length && oneSubstitutionApart(word, productWord.slice(0, word.length))) return 'prefix'
  return null
}

function oneSubstitutionApart(a: string, b: string): boolean {
  let differences = 0
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i] && (differences += 1) > 1) return false
  return true
}

export type ReceiptPackageReference = {
  resolution: 'concrete' | 'range' | 'unspecified'
  options: { canonical_quantity: number; canonical_unit: 'ks' | 'kg' | 'l' }[]
}

export type ReceiptCandidate = {
  productId: string
  name: string
  storeIds: string[]
  seedPackageReferences?: ReceiptPackageReference[]
}
export type ScoredCandidate = ReceiptCandidate & { score: number }

/** How well `candidate` fits a receipt line, or null when it does not: at least two thirds of the
 *  line's words must each be the start of a word in the product's name. A whole word scores more than
 *  a word start, every product word the line does not mention costs a little (the plain product
 *  outranks a longer one built on it — "Máslo" before "Máslové sušenky"), an agreeing package size
 *  adds and a different one subtracts, and a product sold at the receipt's own chain wins a tie. */
function seedPackageScore(lineSize: number | null, references: ReceiptPackageReference[] | undefined): number {
  if (lineSize == null || !references?.length) return 0
  let best = 0
  for (const reference of references) {
    if (reference.resolution === 'unspecified') continue
    const sizes = reference.options
      .map((option) => option.canonical_unit === 'kg' ? option.canonical_quantity * 1000 : option.canonical_unit === 'l' ? option.canonical_quantity * 1000 : option.canonical_quantity)
      .filter((size) => Number.isFinite(size) && size > 0)
    if (!sizes.length) continue
    if (reference.resolution === 'range') {
      const min = Math.min(...sizes)
      const max = Math.max(...sizes)
      if (lineSize >= min && lineSize <= max) best = Math.max(best, 2)
      else best = Math.max(best, -1.5)
    }
  }
  return best
}

export function scoreReceiptCandidate(line: { words: string[]; size: number | null; storeId: string | null; ownBrand?: string | null }, candidate: ReceiptCandidate): number | null {
  if (line.words.length === 0) return null
  const productWords = receiptWordsOfProduct(candidate.name)
  let points = 0
  let matched = 0
  const used = new Set<number>()
  for (const word of line.words) {
    let best: 'exact' | 'prefix' | null = null
    let bestIndex = -1
    productWords.forEach((productWord, index) => {
      if (used.has(index) || best === 'exact') return
      const kind = wordMatches(word, productWord)
      if (kind && (best === null || kind === 'exact')) {
        best = kind
        bestIndex = index
      }
    })
    if (best) {
      used.add(bestIndex)
      matched += 1
      points += best === 'exact' ? 1 : 0.8
    }
  }
  if (matched / line.words.length < 2 / 3) return null
  let score = (points / line.words.length) * 10 - (productWords.length - used.size) * 0.3
  const size = packageSize(candidate.name)
  if (line.size != null && size != null) score += Math.abs(line.size - size) <= Math.max(1, line.size * 0.02) ? 2 : -4
  score += seedPackageScore(line.size, candidate.seedPackageReferences)
  if (line.storeId && candidate.storeIds.includes(line.storeId)) score += 0.5
  // The brand word is not one of the line's words, so it is neither required nor penalised as left over.
  if (line.ownBrand && productWords.includes(line.ownBrand)) score += 1.5 + 0.3
  return score
}

/** The product side of the comparison: the catalog name's words, accents stripped, sizes dropped. */
function receiptWordsOfProduct(name: string): string[] {
  return plainText(name)
    .replace(SIZE_PATTERN, ' ')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !/\d/.test(word))
}

/** A score from which the best candidate may be pre-selected: every word matched, mostly as whole
 *  words, with little left over — and clearly ahead of the runner-up (CONFIDENT_MARGIN). */
export const CONFIDENT_SCORE = 9
export const CONFIDENT_MARGIN = 1.5
export const MAX_SUGGESTIONS = 3

export type ReceiptSuggestions = { suggestions: { productId: string; name: string }[]; confident: boolean }

/** The best few catalog products for one receipt line, best first; `confident` when the first may be
 *  pre-selected for the household (still only a pre-selection in the review form). */
export function rankReceiptCandidates(lineName: string, storeId: string | null, candidates: ReceiptCandidate[]): ReceiptSuggestions {
  const line = { words: receiptWords(lineName), size: packageSize(lineName), storeId, ownBrand: receiptOwnBrand(lineName) }
  const scored: ScoredCandidate[] = []
  for (const candidate of candidates) {
    const score = scoreReceiptCandidate(line, candidate)
    if (score != null) scored.push({ ...candidate, score })
  }
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.productId.localeCompare(b.productId))
  const top = scored.slice(0, MAX_SUGGESTIONS)
  const confident =
    top.length > 0 &&
    top[0].score >= CONFIDENT_SCORE &&
    (top.length === 1 || top[0].score - top[1].score >= CONFIDENT_MARGIN) &&
    // "ALB PUD.PRICH.VA" is Albert's own pudding: another brand's vanilla pudding is a different
    // product, however well the words fit, so it is offered but not pre-selected.
    (line.ownBrand == null || receiptWordsOfProduct(top[0].name).includes(line.ownBrand))
  return { suggestions: top.map(({ productId, name }) => ({ productId, name })), confident }
}

/** The words the database search requires of a candidate's name for this line: the two longest
 *  (three letters at least), as a short word matches too much of a 47,000-product catalog. */
export function receiptSearchWords(lineName: string): string[] {
  return receiptWords(lineName)
    .filter((word) => word.length >= 3)
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, 2)
}
