// How the shopping list is shown (filters, sort, grouping), remembered per device so the list
// looks the same after a reload or the app's periodic refresh. Only view settings are stored —
// never list contents. Stored values are validated: an old or hand-edited value falls back to the
// default instead of breaking the list.

export const LIST_VIEW_STORAGE_KEY = 'shopping-buddy:list-view'

export const SORT_KEYS = ['Výchozí', 'Název', 'Cena', 'Priorita'] as const
export const GROUP_KEYS = ['Bez seskupení', 'Podle kategorie', 'Podle obchodu'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type GroupKey = (typeof GROUP_KEYS)[number]

export type ListViewPreference = { category: string; showCompleted: boolean; sort: SortKey; group: GroupKey }

export const DEFAULT_LIST_VIEW: ListViewPreference = { category: 'Vše', showCompleted: true, sort: 'Výchozí', group: 'Bez seskupení' }

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Parses a stored value; every field is checked on its own, unknown ones take the default. */
export function parseListView(raw: string | null, categories: readonly string[]): ListViewPreference {
  if (!raw) return DEFAULT_LIST_VIEW
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    // Corrupt JSON is treated like no stored value: the default view.
    return DEFAULT_LIST_VIEW
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_LIST_VIEW
  const v = value as Record<string, unknown>
  return {
    category: typeof v.category === 'string' && (v.category === 'Vše' || categories.includes(v.category)) ? v.category : DEFAULT_LIST_VIEW.category,
    showCompleted: typeof v.showCompleted === 'boolean' ? v.showCompleted : DEFAULT_LIST_VIEW.showCompleted,
    sort: SORT_KEYS.includes(v.sort as SortKey) ? (v.sort as SortKey) : DEFAULT_LIST_VIEW.sort,
    group: GROUP_KEYS.includes(v.group as GroupKey) ? (v.group as GroupKey) : DEFAULT_LIST_VIEW.group,
  }
}

export function readListView(storage: StorageLike | undefined, categories: readonly string[]): ListViewPreference {
  try {
    return parseListView(storage?.getItem(LIST_VIEW_STORAGE_KEY) ?? null, categories)
  } catch {
    // Unreadable storage (private mode, blocked site data): the default view.
    return DEFAULT_LIST_VIEW
  }
}

export function saveListView(storage: StorageLike | undefined, view: ListViewPreference): void {
  try {
    storage?.setItem(LIST_VIEW_STORAGE_KEY, JSON.stringify(view))
  } catch {
    // Not remembered on this device; the view still works for this visit.
  }
}
