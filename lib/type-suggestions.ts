// Suggesting a product type (druh zboží) for a receipt line the rules and the catalog could not place.
// Pure ranking only — the neighbour lookup is lib/db/type-suggestions.ts.
//
// Measured on the production catalog (2026-10-11): where the nearest typed products agree, the type
// they share is right almost every time on clean names, but too weak to apply on its own for the
// abbreviated lines that matter here — so this only ever *offers* types in the review form; nothing
// is stored until the household picks one.

/** A typed catalog product that is textually close to the line. `similarity` is pg_trgm's 0–1. */
export type TypeNeighbour = { typeKey: string; similarity: number }

export type TypeSuggestion = { key: string; weight: number }

/** At most this many types are offered per line. */
export const MAX_TYPE_SUGGESTIONS = 3

/** A type backed by less than this share of the neighbours' total similarity is noise, not a choice. */
const MIN_SHARE = 0.15

/** Types ranked by the summed similarity of the neighbours that carry them, best first. Ties break on
 *  the key so the order is stable. A type needs a meaningful share of the evidence to be offered. */
export function rankTypeSuggestions(neighbours: TypeNeighbour[]): TypeSuggestion[] {
  const weights = new Map<string, number>()
  for (const neighbour of neighbours) {
    if (!(neighbour.similarity > 0)) continue
    weights.set(neighbour.typeKey, (weights.get(neighbour.typeKey) ?? 0) + neighbour.similarity)
  }
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0)
  if (total === 0) return []
  return [...weights.entries()]
    .map(([key, weight]) => ({ key, weight }))
    .filter((suggestion) => suggestion.weight / total >= MIN_SHARE)
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
    .slice(0, MAX_TYPE_SUGGESTIONS)
}
