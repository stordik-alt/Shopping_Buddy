// Matching what a receipt says was bought against what is still open on a shopping list.
//
// Pure and deterministic (CLAUDE.md sections 5 and 25): no database, no network. The receipt's
// wording ("MLEKO POLOTUC. 1L") almost never equals the list's ("Mléko"), so there are two levels of
// confidence and the caller treats them differently:
//   - certain:   the same catalog product, or the same name once case, diacritics and punctuation are
//                ignored. Safe to tick automatically.
//   - suggested: every word of the list item also appears (loosely) in the receipt line. Plausible,
//                but only a person can say "Mléko" was the 1 l semi-skimmed one — so it is offered
//                for confirmation and never applied on its own (nothing is guessed).
// A receipt line is matched to at most one list item and vice versa.

export type MatchableListItem = { id: string; name: string; productId: string | null }
export type MatchablePurchaseItem = { id: string; name: string; productId: string | null }

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

/** Two words are "the same" when equal, when one is a prefix of the other ("mleko"/"mlekem" is not
 *  covered, "jogurt"/"jogurty" is), or when they share a long stem ("jablka"/"jablko"). Short words
 *  must be equal so "ks"/"kg" or "sul"/"sulc" never match by accident. */
function tokensMatch(listToken: string, receiptToken: string): boolean {
  if (listToken === receiptToken) return true
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
        ((listItem.productId != null && listItem.productId === purchase.productId) || (listName !== '' && listName === normalizeMatchName(purchase.name))),
    )
    if (hit) {
      certain.push({ listItemId: listItem.id, purchaseItemId: hit.id })
      takenPurchase.add(hit.id)
      matchedList.add(listItem.id)
    }
  }

  // Pass 2 — suggestions for what is left, each list item taking the closest remaining line.
  for (const listItem of listItems) {
    if (matchedList.has(listItem.id)) continue
    let best: { id: string; extra: number } | null = null
    for (const purchase of purchaseItems) {
      if (takenPurchase.has(purchase.id)) continue
      const extra = looseMatchExtraWords(listItem.name, purchase.name)
      if (extra != null && (best == null || extra < best.extra)) best = { id: purchase.id, extra }
    }
    if (best) {
      suggested.push({ listItemId: listItem.id, purchaseItemId: best.id })
      takenPurchase.add(best.id)
    }
  }

  return { certain, suggested }
}
