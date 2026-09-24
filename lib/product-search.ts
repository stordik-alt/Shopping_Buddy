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

/** How well a product name matches the tokens: 0 when any token is missing, otherwise higher for
 *  whole-word and prefix matches, a name that starts with the first token, and an exact match.
 *  `searchName` is the normalized name (`products.search_name`). */
export function scoreMatch(searchName: string, tokens: string[], optionalTokens: string[] = []): number {
  if (tokens.length === 0) return 0
  let score = 0
  // A size or strength the name also states is a better match ("1l" found in "Mléko 1l").
  for (const token of optionalTokens) if (searchName.includes(token)) score += 3
  for (const token of tokens) {
    const index = searchName.indexOf(token)
    if (index < 0) return 0
    const atWordStart = index === 0 || !/[a-z0-9]/.test(searchName[index - 1])
    const endsWord = !/[a-z0-9]/.test(searchName[index + token.length] ?? ' ')
    score += atWordStart ? (endsWord ? 4 : 3) : 1
  }
  if (searchName.startsWith(tokens[0])) score += 2
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
