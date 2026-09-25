// Words that name the same groceries but that no general rule connects: irregular Czech forms
// ("vejce" / "vajíčka" / "vajec", "párek" / "párky", "mrkev" / "mrkve"), colloquial or regional
// names ("mlíko", "paradajky") and spelling variants ("kečup" / "kechup"). The regular forms
// ("rohlík" / "rohlíky", "jablko" / "jablka") are already handled by word stems
// (lib/product-search.ts), so only what they cannot reach belongs here.
//
// Used everywhere a product name is matched: product search and the shopping planner
// (lib/product-search.ts, lib/db/product-search.ts), receipt lines against the list
// (lib/receipt-list-match.ts), and purchase history against the pantry and usual items
// (lib/purchase-rhythm.ts). Deliberately short and strict: a pair belongs here only when the two
// words name the same thing to a Czech shopper. A subtype is not a synonym ("špagety" are pasta, but
// "těstoviny" on a list are not a request for spaghetti), and neither is a derived product
// ("kuřecí" is not "kuře").
//
// Words are in the normalized form every matcher compares: lower case, without diacritics.
// Grouping keys use `matchKey()` (lib/receipt-list-match.ts).

const GROUPS: string[][] = [
  ['vejce', 'vajicko', 'vajicka', 'vajec', 'vajicek'],
  ['parek', 'parky', 'parku'],
  ['mrkev', 'mrkve', 'mrkvi'],
  ['mleko', 'mliko'],
  ['rajce', 'rajcata', 'paradajka', 'paradajky'],
  ['kecup', 'kechup'],
  ['chipsy', 'chips', 'bramburky'],
  ['pivo', 'piva'],
  ['maso', 'masa'],
  ['cesnek', 'cesneku'],
  ['chleb', 'chleba', 'chlebu'],
  ['jogurt', 'jogurty', 'jogurtu'],
]

const GROUP_OF = new Map<string, readonly string[]>()
for (const group of GROUPS) for (const word of group) GROUP_OF.set(word, group)

/** The word and every word of its synonym group (the word first). A word with no group: just itself. */
export function synonymsOf(word: string): string[] {
  const group = GROUP_OF.get(word)
  return group ? [word, ...group.filter((other) => other !== word)] : [word]
}

/** One representative per synonym group ("vajíčka" → "vejce"), so names can be compared by key. */
export function canonicalWord(word: string): string {
  return GROUP_OF.get(word)?.[0] ?? word
}

/** A normalized name ("vajicka m 10 ks") with every word replaced by its group's representative
 *  ("vejce m 10 ks"). Two names with the same result name the same thing as far as synonyms go. */
export function canonicalName(normalizedName: string): string {
  return normalizedName
    .split(' ')
    .map((word) => canonicalWord(word))
    .join(' ')
}
