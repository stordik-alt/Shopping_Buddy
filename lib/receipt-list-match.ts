import { canonicalName, canonicalWord } from '@/lib/synonyms'
import { isStrongReceiptProductMatch } from '@/lib/receipt-product-match'

// Matching what a receipt says was bought against what is still open on a shopping list.
//
// Pure and deterministic (CLAUDE.md sections 5 and 25): no database, no network. The receipt's
// wording ("MLEKO POLOTUC. 1L") almost never equals the list's ("Mléko"), so there are two levels of
// confidence and the caller treats them differently:
//   - certain:   the same catalog product, the same name once case, diacritics and punctuation are
//                ignored, or a catalog product whose type is one the list item asks for (docs/
//                12_PRODUCT_TYPES.md phase 4). Safe to tick automatically.
//   - suggested: a line whose type, read off its printed text, is one the item asks for ("KUR.PRSA"
//                for "Kuřecí maso"); or, when either side has no type, every word of the list item
//                also appears (loosely) in the receipt line. Plausible, but only a person can say
//                "Mléko" was the 1 l semi-skimmed one — so it is offered for confirmation and never
//                applied on its own (nothing is guessed).
// A line whose type is known and is not one the item asks for is never matched to it, however well
// the words fit ("Máslové sušenky" for "Máslo").
// A receipt line is matched to at most one list item and vice versa.

export type MatchableListItem = {
  id: string
  name: string
  productId: string | null
  /** The canonical catalog product name for a selected product. This lets a receipt line be
   * matched to the exact product chosen on the shopping list even when the receipt import did not
   * persist the product id (for example, a retailer abbreviation). */
  catalogProductName?: string | null
  /** The product-type keys the item asks for (lib/product-types.ts `describeItemTypes`), or null/absent
   *  when it has none and is matched by text alone. */
  acceptedTypes?: string[] | null
}
export type MatchablePurchaseItem = {
  id: string
  name: string
  productId: string | null
  /** The line's product type, if known, and whether its catalog product states it (`fromProduct`) or
   *  only the rules read it off the printed text. Absent: the line has no known type. */
  type?: { key: string; fromProduct: boolean } | null
}

export type ReceiptListPair = { listItemId: string; purchaseItemId: string }

export type ReceiptListMatches = {
  certain: ReceiptListPair[]
  suggested: ReceiptListPair[]
}

/** Lower-cases, strips diacritics and turns every non-alphanumeric run into a single space, so
 *  "Mléko, polotučné" and "MLEKO POLOTUCNE" compare equal. */
export function normalizeMatchName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokens(name: string): string[] {
  return normalizeMatchName(name).split(' ').filter(Boolean)
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1
  return length
}

/** Two words are "the same" when equal, when they are synonyms, when one is a prefix of the other ("mleko"/"mlekem" is not
 *  covered, "jogurt"/"jogurty" is), or when they share a long stem ("jablka"/"jablko"). Short words
 *  must be equal so "ks"/"kg" or "sul"/"sulc" never match by accident. */
function tokensMatch(listToken: string, receiptToken: string): boolean {
  if (listToken === receiptToken) return true
  // Synonyms (lib/synonyms.ts): "Vajíčka" on the list, "VEJCE M 10KS" on the receipt.
  if (canonicalWord(listToken) === canonicalWord(receiptToken)) return true
  const shortest = Math.min(listToken.length, receiptToken.length)
  if (shortest >= 4 && (listToken.startsWith(receiptToken) || receiptToken.startsWith(listToken))) return true
  return shortest >= 5 && commonPrefixLength(listToken, receiptToken) >= 5
}

/** Every word of the list item is found in the receipt line; returns how many receipt words were
 *  left over (fewer = a closer match), or `null` when the line does not contain the whole item. */
function looseMatchExtraWords(listName: string, receiptName: string): number | null {
  const wanted = tokens(listName)
  if (wanted.length === 0) return null
  const available = tokens(receiptName)
  const used = new Set<number>()
  for (const word of wanted) {
    const index = available.findIndex((candidate, i) => !used.has(i) && tokensMatch(word, candidate))
    if (index === -1) return null
    used.add(index)
  }
  return available.length - used.size
}

export function matchReceiptToList(listItems: MatchableListItem[], purchaseItems: MatchablePurchaseItem[]): ReceiptListMatches {
  const certain: ReceiptListPair[] = []
  const suggested: ReceiptListPair[] = []
  const takenPurchase = new Set<string>()
  const matchedList = new Set<string>()

  // Pass 1 — certain matches, in list order so the result does not depend on receipt order.
  for (const listItem of listItems) {
    const listName = normalizeMatchName(listItem.name)
    const hit = purchaseItems.find(
      (purchase) =>
        !takenPurchase.has(purchase.id) &&
        ((listItem.productId != null && listItem.productId === purchase.productId) ||
          (listItem.productId != null && listItem.catalogProductName != null && isStrongReceiptProductMatch(purchase.name, listItem.catalogProductName)) ||
          (listName !== '' && listName === normalizeMatchName(purchase.name))),
    )
    if (hit) {
      certain.push({ listItemId: listItem.id, purchaseItemId: hit.id })
      takenPurchase.add(hit.id)
      matchedList.add(listItem.id)
    }
  }

  // Pass 1b — a catalog product of a type the item asks for is the kind of goods wanted.
  for (const listItem of listItems) {
    const accepted = listItem.acceptedTypes
    if (matchedList.has(listItem.id) || !accepted?.length) continue
    const hit = purchaseItems.find((purchase) => !takenPurchase.has(purchase.id) && purchase.type?.fromProduct && accepted.includes(purchase.type.key))
    if (hit) {
      certain.push({ listItemId: listItem.id, purchaseItemId: hit.id })
      takenPurchase.add(hit.id)
      matchedList.add(listItem.id)
    }
  }

  // Pass 2 — suggestions for what is left, each list item taking the closest remaining line.
  for (const listItem of listItems) {
    if (matchedList.has(listItem.id)) continue
    const accepted = listItem.acceptedTypes?.length ? listItem.acceptedTypes : null
    let best: { id: string; extra: number } | null = null
    for (const purchase of purchaseItems) {
      if (takenPurchase.has(purchase.id)) continue
      let extra: number | null
      if (accepted && purchase.type) {
        // Both sides know their kind, so it alone decides; the words only rank several fitting lines.
        extra = accepted.includes(purchase.type.key) ? (looseMatchExtraWords(listItem.name, purchase.name) ?? Number.MAX_SAFE_INTEGER) : null
      } else {
        extra = looseMatchExtraWords(listItem.name, purchase.name)
      }
      if (extra != null && (best == null || extra < best.extra)) best = { id: purchase.id, extra }
    }
    if (best) {
      suggested.push({ listItemId: listItem.id, purchaseItemId: best.id })
      takenPurchase.add(best.id)
    }
  }

  return { certain, suggested }
}

/** A name as a matching key: normalized (`normalizeMatchName`) with synonyms folded together
 *  (lib/synonyms.ts), so "Vajíčka" and "vejce" are the same key. For grouping purchases and finding
 *  the pantry item a purchase refers to — never for display. */
export function matchKey(name: string): string {
  return canonicalName(normalizeMatchName(name))
}
