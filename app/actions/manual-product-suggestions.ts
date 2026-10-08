'use server'

import { requireHouseholdId } from '@/lib/auth/authorize'
import { searchManualProductSuggestions, type ManualProductSuggestion } from '@/lib/manual-product-suggestions'

export type { ManualProductSuggestion }

/** Price-free suggestions for manual item entry. No prices, deals or stores are queried. */
export async function searchManualProductSuggestionsAction(query: string): Promise<ManualProductSuggestion[]> {
  await requireHouseholdId()
  return searchManualProductSuggestions(query)
}
