import { describe, expect, it } from 'vitest'
import { DEFAULT_LIST_VIEW, LIST_VIEW_STORAGE_KEY, parseListView, readListView, saveListView } from '@/lib/list-view-preference'

const CATEGORIES = ['Potraviny', 'Drogerie']

describe('shopping-list view preference', () => {
  it('round-trips a saved view', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    const view = { category: 'Drogerie', showCompleted: false, sort: 'Cena' as const, group: 'Podle obchodu' as const }
    saveListView(storage, view)
    expect(data.has(LIST_VIEW_STORAGE_KEY)).toBe(true)
    expect(readListView(storage, CATEGORIES)).toEqual(view)
  })

  it('uses the default for nothing stored or corrupt JSON', () => {
    expect(parseListView(null, CATEGORIES)).toEqual(DEFAULT_LIST_VIEW)
    expect(parseListView('{nope', CATEGORIES)).toEqual(DEFAULT_LIST_VIEW)
    expect(parseListView('42', CATEGORIES)).toEqual(DEFAULT_LIST_VIEW)
  })

  it('replaces each unknown field with its default and keeps the valid ones', () => {
    const raw = JSON.stringify({ category: 'Hračky', showCompleted: 'ano', sort: 'Cena', group: 'Podle barvy' })
    expect(parseListView(raw, CATEGORIES)).toEqual({ ...DEFAULT_LIST_VIEW, sort: 'Cena' })
  })

  it('falls back to the default when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readListView(broken, CATEGORIES)).toEqual(DEFAULT_LIST_VIEW)
    expect(() => saveListView(broken, DEFAULT_LIST_VIEW)).not.toThrow()
  })
})
