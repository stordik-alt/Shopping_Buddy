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
  ['parek', 'parky', 'parku', 'parkem'],
  ['mrkev', 'mrkve', 'mrkvi'],
  ['mleko', 'mliko', 'mlekem'],
  ['rajce', 'rajcata', 'paradajka', 'paradajky'],
  ['kecup', 'kechup'],
  ['chipsy', 'chips', 'bramburky'],
  ['pivo', 'piva', 'pivu', 'pivem'],
  ['maso', 'masa', 'masu', 'masem'],
  ['cesnek', 'cesneku', 'cesnekem'],
  ['chleb', 'chleba', 'chlebu', 'chlebem'],
  ['jogurt', 'jogurty', 'jogurtu', 'jogurtem'],
  // The words below are all four letters or shorter at the root, so `searchStem()` (which only
  // trims a word of 5+ letters) never reduces them — "sýry" cannot otherwise be recognized as the
  // same word as "sýr" the way "rohlíky"/"rohlík" already is. Same reasoning as `maso`/`masa`
  // above, just for more of the shortest, most common grocery nouns.
  ['syr', 'syry', 'syra', 'syru', 'syrem'], // sýr (cheese)
  ['caj', 'caje', 'caji', 'caju', 'cajem'], // čaj (tea)
  ['med', 'medu', 'medem'], // med (honey)
  ['ryze', 'ryzi'], // rýže (rice)
  ['olej', 'olejem'], // olej (oil) — "oleje"/"oleji" already stem to it
  // Irregular vowel changes in declension, not just a suffix, so no stem length would find these
  // either way: sůl → soli, víno → vína/vínu/vínem, káva → kávy/kávě/kávu/kávou.
  ['sul', 'soli'], // sůl (salt)
  ['vino', 'vina', 'vinu', 'vinem'], // víno (wine)
  ['kava', 'kavy', 'kave', 'kavu', 'kavou'], // káva (coffee)
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
