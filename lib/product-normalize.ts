// Text normalization + fuzzy comparison shared by product/alias matching (lib/product-aliases.ts,
// lib/categorization.ts) and by the existing accent-insensitive search (lib/product-search.ts) —
// deliberately a *different*, more aggressive normalization than that one: search only strips
// accents/case so a user's partial typing still finds things, while receipt-line matching also has
// to survive OCR noise (merged/split words, stray punctuation, digit/letter confusions) that would
// make search too loose. Never used to silently rewrite what is stored — only to compare.

/** Turns raw receipt/product text into a comparison key: diacritics stripped, lower-cased, and
 *  every run of non-alphanumeric characters (spaces, punctuation, dots) collapsed to a single
 *  space. Digits are deliberately left exactly as printed — "MAT 15" and "MATTONI 1,5L" must stay
 *  distinguishable from "MATTONI" alone (CLAUDE.md section 12: "must not be treated as equivalent
 *  simply because..."), so this function never guesses that a digit was meant to be a letter or
 *  vice versa. Single-character OCR confusions (JUP1K vs JUPIK, MATTON1 vs MATTONI) are instead
 *  caught by edit-distance fuzzy matching (`similarity()` below) one tier down in
 *  lib/categorization.ts — a real edit-distance-1 typo is exactly what Levenshtein is for, without
 *  a blind digit→letter substitution table that would otherwise corrupt genuine quantity digits
 *  ("1,5L" briefly became "i sl" during development — this comment is the record of why that
 *  approach was abandoned). */
export function normalizeProductText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Classic Levenshtein edit distance (insertions/deletions/substitutions), iterative two-row
 *  implementation — no dependency needed for strings this short (product names/aliases, a few dozen
 *  characters at most). Used only for *fuzzy candidate scoring* below a hard length/threshold guard,
 *  never to silently accept a match (CLAUDE.md section 12/CLAUDE.md's "NEHÁDEJ" philosophy — see
 *  lib/categorization.ts's fuzzyMatch). */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i += 1) {
    const currentRow = [i + 1]
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1
      currentRow.push(Math.min(currentRow[j] + 1, previousRow[j + 1] + 1, previousRow[j] + cost))
    }
    previousRow = currentRow
  }
  return previousRow[b.length]
}

/** Similarity in [0, 1] derived from edit distance, normalized by the longer string's length (so
 *  short strings need near-exact matches while longer ones tolerate a couple of OCR-scale typos
 *  proportionally). 1 means identical, 0 means completely different. */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}
