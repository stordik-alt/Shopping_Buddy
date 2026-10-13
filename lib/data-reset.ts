// Which user data the household owner can wipe in one go (docs/39_DATA_RESET.md). Pure, so the server
// action, the database step and the confirmation dialog share one list and cannot disagree.

export const DATA_RESET_GROUPS = ['shopping', 'purchases', 'expenses', 'incomes', 'budget', 'pantry', 'recipes', 'notifications'] as const
export type DataResetGroup = (typeof DATA_RESET_GROUPS)[number]

export const DATA_RESET_LABELS: Record<DataResetGroup, { title: string; description: string }> = {
  shopping: { title: 'Nákupní seznamy', description: 'Položky všech seznamů a seznamy navíc. Jeden prázdný seznam zůstane.' },
  purchases: { title: 'Nákupy a účtenky', description: 'Historie nákupů, účtenky i jejich fotky a výdaje, které z nákupů vznikly.' },
  expenses: { title: 'Výdaje', description: 'Všechny výdaje, i ručně zapsané.' },
  incomes: { title: 'Příjmy', description: 'Plánované i přijaté příjmy.' },
  budget: { title: 'Rozpočet a plánování', description: 'Limity a cíl úspor, plánované výdaje, Kapsy, pravidelné platby a uzavřená období.' },
  pantry: { title: 'Zásoby', description: 'Položky zásob. Místa a hlídání minima a maxima zůstanou.' },
  recipes: { title: 'Recepty a jídelníčky', description: 'Oblíbené recepty, historie receptů a týdenní jídelníčky.' },
  notifications: { title: 'Oznámení', description: 'Oznámení ve zvonku. Nastavení upozornění zůstane.' },
}

/** Keeps only known groups, once each and in the canonical order; anything else is dropped. */
export function normalizeResetGroups(input: readonly unknown[]): DataResetGroup[] {
  return DATA_RESET_GROUPS.filter((group) => input.includes(group))
}

/** The name typed to confirm must be the household's own (case and surrounding spaces do not matter). */
export function confirmsHouseholdName(typed: string, householdName: string): boolean {
  return householdName.trim() !== '' && typed.trim().toLowerCase() === householdName.trim().toLowerCase()
}
