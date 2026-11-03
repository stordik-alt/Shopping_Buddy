import type { GroupKey, SortKey } from '../../../lib/list-view-preference'

export type ShoppingListViewItem = {
  name: string
  done: boolean
  category?: string
  store?: string | null
  priority?: 'Nízká' | 'Normální' | 'Vysoká'
}

export type ShoppingListFilters = {
  query: string
  category: string
  showCompleted: boolean
}

const PRIORITY_WEIGHT: Record<NonNullable<ShoppingListViewItem['priority']>, number> = {
  Vysoká: 0,
  Normální: 1,
  Nízká: 2,
}

export function filterShoppingListItems<T extends ShoppingListViewItem>(items: T[], filters: ShoppingListFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase('cs-CZ')
  return items.filter((item) =>
    (!query || item.name.toLocaleLowerCase('cs-CZ').includes(query))
    && (filters.category === 'Vše' || item.category === filters.category)
    && (filters.showCompleted || !item.done),
  )
}

export function sortShoppingListItems<T extends ShoppingListViewItem>(items: T[], sort: SortKey): T[] {
  const sorted = [...items]
  if (sort === 'Název') sorted.sort((a, b) => a.name.localeCompare(b.name, 'cs-CZ'))
  if (sort === 'Priorita') {
    sorted.sort((a, b) => (PRIORITY_WEIGHT[a.priority ?? 'Normální'] - PRIORITY_WEIGHT[b.priority ?? 'Normální'])
      || a.name.localeCompare(b.name, 'cs-CZ'))
  }
  return sorted
}

export function groupShoppingListItems<T extends ShoppingListViewItem>(
  items: T[],
  group: GroupKey,
): { title: string; data: T[] }[] {
  if (group === 'Bez seskupení') {
    const remaining = items.filter((item) => !item.done).length
    return [{ title: `${remaining} zbývá`, data: items }]
  }

  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const title = group === 'Podle kategorie'
      ? item.category ?? 'Bez kategorie'
      : item.store ?? 'Bez obchodu'
    grouped.set(title, [...(grouped.get(title) ?? []), item])
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'cs-CZ'))
    .map(([title, data]) => ({ title, data }))
}
