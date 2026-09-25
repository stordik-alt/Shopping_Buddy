// A retailer whose branches are split into chains by store format: Albert's hypermarkets are moved
// from "Albert" to "Albert Hypermarket" (lib/stores/albert-formats.ts), because their flyer and prices
// differ. Outside sources do not know the split — OpenStreetMap tags every branch "Albert", and a
// hypermarket's receipt is read as "Albert" — so code that recognises an existing branch from such a
// source compares the retailer (the family), not the chain.
const CHAIN_FAMILY: Record<string, string> = { 'Albert Hypermarket': 'Albert' }

/** The retailer a chain belongs to ("Albert Hypermarket" → "Albert"; any other chain → itself). */
export function chainFamily(chain: string): string {
  return CHAIN_FAMILY[chain] ?? chain
}
