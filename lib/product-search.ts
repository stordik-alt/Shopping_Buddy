import type { ItemCategory, ItemUnit } from '@/lib/types'

// Finding specific products in the chains' catalogs by what the user types ("mleko 1l").
//
// Search is by text, accent- and case-insensitive: "mléko" finds "Čerstvé mléko 1,5%", and so does
// "mleko". `products.search_name` (a stored generated column, migration 0020) holds each name in the
// normalized form produced by `normalizeSearchText()` below; the two use the same character map, so
// the database and this module agree on what "normalized" means (a DB test checks that they do). The
// rules here are pure — tokenizing, scoring and grouping — so they are deterministic and testable.

/** Czech/Slovak diacritics and their plain-ASCII counterparts. Used by the SQL `translate()` of the
 *  `search_name` column and by `normalizeSearchText()`, so both sides normalize identically. */
export const SEARCH_ACCENTED = 'áäčďéěíĺľňóöôŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÖÔŔŘŠŤÚŮÜÝŽ'
export const SEARCH_PLAIN = 'aacdeeillnooorrstuuuyzAACDEEILLNOOORRSTUUUYZ'

const CHAR_MAP = new Map([...SEARCH_ACCENTED].map((char, index) => [char, SEARCH_PLAIN[index]]))

/** Lower-case, accent-free form of a name — the same transformation as the `search_name` column. */
export function normalizeSearchText(text: string): string {
  let result = ''
  for (const char of text) result += CHAR_MAP.get(char) ?? char
  return result.toLowerCase()
}

const MAX_TOKENS = 6
const MAX_QUERY_LENGTH = 80

/** The words of a query, normalized: "  Mléko  1,5% " -> ["mleko", "1,5%"]. Every token must occur
 *  in a product's name. A single character is dropped unless it is a digit (noise like "a", "s"),
 *  and at most six tokens are used so a pasted paragraph cannot become a huge query. */
export function searchTokens(query: string): string[] {
  const tokens = normalizeSearchText(query.slice(0, MAX_QUERY_LENGTH))
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9%]+$/g, ''))
    .filter((token) => token.length > 1 || /\d/.test(token))
  return [...new Set(tokens)].slice(0, MAX_TOKENS)
}

/** Splits tokens into the ones a product name must contain and the ones that only raise its rank.
 *  Words are required; a token with a digit ("1l", "250", "1,5%") is a size or strength, and names
 *  often omit it (Lidl lists "Mléko polotučné" without its volume), so requiring it would hide every
 *  such product. If the query has no word at all (only "250"), every token is required. */
export function splitTokens(tokens: string[]): { required: string[]; optional: string[] } {
  const required = tokens.filter((token) => !/\d/.test(token))
  if (required.length === 0) return { required: tokens, optional: [] }
  return { required, optional: tokens.filter((token) => /\d/.test(token)) }
}

/** A SQL `LIKE` pattern that matches names containing the token; `%`, `_` and `\` in the token are
 *  escaped so user input cannot act as a wildcard. */
export function likePattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/** Words that tie a product to something else — what it contains, is made from, is flavoured with
 *  or is meant for: "Polévka s vejcem", "Pizza se sýrem", "Chléb ze žita", "Koření na kuře", "Tuňák
 *  v oleji", "Omáčka do těstovin", "Krmivo pro psy", "Jogurt bez laktózy". What follows such a word
 *  describes the product; it is not the product. ("a" is deliberately not one: "Sůl a pepř" is both.) */
const LINK_WORDS = new Set(['s', 'se', 'z', 'ze', 'na', 'v', 've', 'do', 'pro', 'bez', 'k', 'ke', 'od', 'po', 'with'])

// --- Word forms --------------------------------------------------------------------------------
//
// Czech inflects: the list says "Rohlíky", the catalog "Rohlík tukový"; "Vejce" appears as "vejcem"
// in "Polévka s vejcem". Plain substring matching both misses the first and treats the second as
// eggs. So a search word is reduced to a stem, and a word of a product name counts as the *same*
// word only when it is that stem plus a short inflectional ending ("rohlik" + "y", "jablk" + "o").
// A derived word — an adjective like "banánové", "rajčatový", "kuřecí" — continues the stem with
// something else and names a different product ("Banánové chipsy" are not bananas).

/** Endings that inflect a noun (or an adjective used as the search word) without changing what it
 *  names: case and number forms. Derivational suffixes (-ový, -ný, -cí, -ský, -ek…) are not here. */
const INFLECTIONS = new Set(['', 'a', 'e', 'i', 'o', 'u', 'y', 'em', 'ou', 'am', 'ami', 'ach', 'ech', 'ata', 'aty', 'ete', 'eti'])

/** The stem of a normalized search word: its last vowel dropped when the word is long enough that
 *  what remains is still specific (≥ 4 letters): "rohliky" → "rohlik", "vejce" → "vejc", "jablka" →
 *  "jablk". Short words ("syr", "maso", "kure") and words with digits stay as they are — "maso"
 *  → "mas" would also find "máslo". */
export function searchStem(token: string): string {
  if (token.length < 5 || /\d/.test(token)) return token
  return /[aeiouy]$/.test(token) ? token.slice(0, -1) : token
}

/** How a word of a product name relates to a search word: 'exact' ("mleko"/"mleko"), 'form' (the
 *  same word inflected: "rohliky"/"rohlik", "vejce"/"vejcem"), 'derived' (a different word built on
 *  the stem: "banan"/"bananove"), 'inside' (somewhere in the word) or null. */
export function wordRelation(word: string, token: string): 'exact' | 'form' | 'derived' | 'inside' | null {
  if (word === token) return 'exact'
  if (/\d/.test(token)) return word.includes(token) ? 'inside' : null
  const stem = searchStem(token)
  if (word.startsWith(stem)) return INFLECTIONS.has(word.slice(stem.length)) ? 'form' : 'derived'
  return word.includes(stem) ? 'inside' : null
}

const WORD_POINTS = { exact: 5, form: 4, derived: 2, inside: 1 } as const

function nameWords(searchName: string): string[] {
  return searchName.split(/[^a-z0-9%]+/).filter(Boolean)
}

/** A token with punctuation inside ("coca-cola", "1,5%", "a_b") spans several name words, so it is
 *  matched against the whole name as a phrase instead of word by word. */
const isPhrase = (token: string) => /[^a-z0-9%]/.test(token)

/** Points for a phrase token: a whole phrase, one at the start of a word, or anywhere. */
function phrasePoints(text: string, token: string): number {
  const index = text.indexOf(token)
  if (index < 0) return 0
  const atWordStart = index === 0 || !/[a-z0-9]/.test(text[index - 1])
  const endsWord = !/[a-z0-9]/.test(text[index + token.length] ?? ' ')
  return atWordStart ? (endsWord ? WORD_POINTS.exact : WORD_POINTS.derived) : WORD_POINTS.inside
}

/** Whether the name *is* what the tokens name, not merely mentions it: every token occurs as the
 *  same word (exactly or inflected, see `wordRelation`) before the first linking word. "vejce" is the
 *  product in "Vejce M 10 ks" and "Čerstvá vejce", but only an ingredient in "Polévka s vejcem", and
 *  "banán" is not "Banánové chipsy". A word at the very start never counts as linking. `searchName`
 *  is the normalized name; tokens are normalized search tokens. */
export function isDirectMatch(searchName: string, tokens: string[]): boolean {
  // Everything before the first linking word (not counting the very first word) names the product.
  const link = [...searchName.matchAll(/[a-z0-9%]+/g)].find((match, index) => index > 0 && LINK_WORDS.has(match[0]))
  const head = link ? searchName.slice(0, link.index) : searchName
  const headWords = nameWords(head)
  return tokens.every((token) => {
    if (isPhrase(token)) return phrasePoints(head, token) === WORD_POINTS.exact
    return headWords.some((word) => {
      const relation = wordRelation(word, token)
      // A size or strength token ("250g") has no word forms; being in the name is enough.
      return relation === 'exact' || relation === 'form' || (/\d/.test(token) && relation === 'inside')
    })
  })
}

/** How well a product name matches the tokens: 0 when any token is missing, otherwise higher for
 *  the same word (exact, then inflected) than a derived word or a match inside a word, plus a bonus
 *  for a name that starts with the first token and for an exact name. A name that is not a direct
 *  match (`isDirectMatch`: it only mentions the tokens, or has them only in derived words) always
 *  ranks below every direct match. `searchName` is the normalized name (`products.search_name`). */
export function scoreMatch(searchName: string, tokens: string[], optionalTokens: string[] = []): number {
  if (tokens.length === 0) return 0
  const score = rawScore(searchName, tokens, optionalTokens)
  if (score === 0) return 0
  // Direct matches score from 100 up, so ranking by score always puts them first; a mention keeps a
  // small positive score so the user can still find it by searching.
  return isDirectMatch(searchName, tokens) ? score + DIRECT_BONUS : Math.max(1, Math.min(score, DIRECT_BONUS - 1))
}

/** Added to the score of a direct match; above any score a mention can reach. */
export const DIRECT_BONUS = 100

function rawScore(searchName: string, tokens: string[], optionalTokens: string[]): number {
  const words = nameWords(searchName)
  let score = 0
  // A size or strength the name also states is a better match ("1l" found in "Mléko 1l").
  for (const token of optionalTokens) if (searchName.includes(token)) score += 3
  for (const token of tokens) {
    const best = isPhrase(token)
      ? phrasePoints(searchName, token)
      : Math.max(0, ...words.map((word) => {
          const relation = wordRelation(word, token)
          return relation ? WORD_POINTS[relation] : 0
        }))
    if (best === 0) return 0
    score += best
  }
  const first = words[0] ? wordRelation(words[0], tokens[0]) : null
  if (first === 'exact' || first === 'form') score += 2
  if (searchName === tokens.join(' ')) score += 10
  return score
}

/** A unit price in a comparable unit: per gram becomes per kilogram, per millilitre per litre, so
 *  prices of different products can be compared at a glance (CLAUDE.md section 17). kg, l and ks are
 *  unchanged. Rounded to haléře. */
export function toComparableUnit(unit: ItemUnit, unitPrice: number): { unit: ItemUnit; unitPrice: number } {
  const round = (value: number) => Math.round(value * 100) / 100
  if (unit === 'g') return { unit: 'kg', unitPrice: round(unitPrice * 1000) }
  if (unit === 'ml') return { unit: 'l', unitPrice: round(unitPrice * 1000) }
  return { unit, unitPrice }
}

export type ProductSearchHit = {
  productId: string
  name: string
  category: ItemCategory
  storeId: string
  chain: string
  /** The latest recorded regular price of one package (or per kg for goods sold by weight). */
  regularPrice: number
  /** An active promotional price, when the chain has one for this product. */
  dealPrice: number | null
  dealValidUntil: string | null
  unit: ItemUnit
  /** Price per `unit` (Kč/kg, Kč/l or Kč/ks), so hits of different pack sizes can be compared. */
  unitPrice: number
  /** The date the price was observed. */
  observedAt: string
  score: number
  /** The product is what was searched for, not something that merely contains or mentions it
   *  (`isDirectMatch`). Only direct matches are ever picked automatically. */
  direct: boolean
}

export type ProductSearchGroup = {
  storeId: string
  chain: string
  hits: ProductSearchHit[]
  /** How many products matched at this chain, including those cut off by the per-chain limit. */
  totalMatches: number
}

/** The price a shopper pays now: the promotion when there is one, else the regular price. */
export const hitPrice = (hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice'>) => hit.dealPrice ?? hit.regularPrice

/** The unit price at the price a shopper pays now. `unitPrice` belongs to the regular price; a
 *  promotion changes the price of the same package, so its unit price scales by the same ratio
 *  (rounded to haléře). Equal to `unitPrice` when there is no promotion. */
export function hitUnitPrice(hit: Pick<ProductSearchHit, 'regularPrice' | 'dealPrice' | 'unitPrice'>): number {
  if (hit.dealPrice == null || hit.regularPrice <= 0) return hit.unitPrice
  return Math.round(((hit.unitPrice * hit.dealPrice) / hit.regularPrice) * 100) / 100
}

/** Groups hits per chain (chains alphabetically, in Czech order), best matches first within a
 *  chain, at most `limitPerChain` shown. Within the same score the cheaper unit price comes first,
 *  then the name, so the order is deterministic. Chains without a hit do not appear. */
export function groupHitsByChain(hits: ProductSearchHit[], limitPerChain: number): ProductSearchGroup[] {
  const byChain = new Map<string, ProductSearchGroup>()
  for (const hit of hits) {
    const group = byChain.get(hit.storeId) ?? { storeId: hit.storeId, chain: hit.chain, hits: [], totalMatches: 0 }
    group.hits.push(hit)
    group.totalMatches++
    byChain.set(hit.storeId, group)
  }
  return [...byChain.values()]
    .map((group) => ({
      ...group,
      hits: group.hits
        .sort((a, b) => b.score - a.score || a.unitPrice - b.unitPrice || a.name.localeCompare(b.name, 'cs'))
        .slice(0, Math.max(limitPerChain, 0)),
    }))
    .sort((a, b) => a.chain.localeCompare(b.chain, 'cs'))
}
