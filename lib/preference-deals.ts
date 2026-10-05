import { MAX_DEALS_QUERY_LENGTH } from '@/lib/deals-browse'
import type { HouseholdPreferences } from '@/lib/types'

// Which deals a household's shopping preferences ask for (docs/16_PREFERENCE_DEALS.md): the preferred
// products and brands are search terms a deal can match ("Pro mě" in Akce, Domů's card); the excluded
// products are terms a deal must not match anywhere in Akce. Matching itself is the Akce search
// (lib/db/deals.ts), so a term finds what typing it into the search box would.

/** At most this many terms of each kind go into one query — enough for any real household. */
export const MAX_PREFERENCE_TERMS = 20

function cleanTerms(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const value of values) {
    const term = value.trim().replace(/\s+/g, ' ').slice(0, MAX_DEALS_QUERY_LENGTH)
    const key = term.toLocaleLowerCase('cs')
    if (!term || seen.has(key)) continue
    seen.add(key)
    terms.push(term)
    if (terms.length === MAX_PREFERENCE_TERMS) break
  }
  return terms
}

export function preferenceDealTerms(preferences: Pick<HouseholdPreferences, 'preferredProducts' | 'preferredBrands' | 'excludedProducts'>): {
  preferred: string[]
  excluded: string[]
} {
  return {
    preferred: cleanTerms([...preferences.preferredProducts, ...preferences.preferredBrands]),
    excluded: cleanTerms(preferences.excludedProducts),
  }
}
