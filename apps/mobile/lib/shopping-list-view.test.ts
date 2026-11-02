import { describe, expect, it } from 'vitest'
import { filterShoppingListItems, groupShoppingListItems, sortShoppingListItems } from './shopping-list-view'

const items = [
  { name: 'Mléko', done: false, category: 'Potraviny', store: 'Lidl', priority: 'Vysoká' as const },
  { name: 'Chléb', done: true, category: 'Potraviny', store: 'Albert', priority: 'Nízká' as const },
  { name: 'Saponát', done: false, category: 'Drogerie', priority: 'Normální' as const },
]

describe('mobile shopping list view', () => {
  it('filters by query, category and completed state', () => {
    expect(filterShoppingListItems(items, { query: 'mlé', category: 'Vše', showCompleted: true })).toEqual([items[0]])
    expect(filterShoppingListItems(items, { query: '', category: 'Drogerie', showCompleted: true })).toEqual([items[2]])
    expect(filterShoppingListItems(items, { query: '', category: 'Vše', showCompleted: false })).toEqual([items[0], items[2]])
  })

  it('sorts by name and priority without mutating the source', () => {
    expect(sortShoppingListItems(items, 'Název').map((item) => item.name)).toEqual(['Chléb', 'Mléko', 'Saponát'])
    expect(sortShoppingListItems(items, 'Priorita').map((item) => item.name)).toEqual(['Mléko', 'Saponát', 'Chléb'])
    expect(items.map((item) => item.name)).toEqual(['Mléko', 'Chléb', 'Saponát'])
  })

  it('groups by category or store and labels missing values', () => {
    expect(groupShoppingListItems(items, 'Podle kategorie')).toEqual([
      { title: 'Drogerie', data: [items[2]] },
      { title: 'Potraviny', data: [items[0], items[1]] },
    ])
    expect(groupShoppingListItems(items, 'Podle obchodu')).toEqual([
      { title: 'Albert', data: [items[1]] },
      { title: 'Bez obchodu', data: [items[2]] },
      { title: 'Lidl', data: [items[0]] },
    ])
  })
})
