import type { Item } from '@/lib/types'

let counter = 0

export function createItem(name: string, overrides: Partial<Item> = {}): Item {
  counter += 1
  return {
    id: Date.now() + counter,
    name,
    detail: '1 ks · bez detailu',
    price: 0,
    quantity: 1,
    unit: 'ks',
    category: 'Ostatní',
    done: false,
    color: 'bg-emerald-100 text-emerald-700',
    priority: 'Normální',
    ...overrides,
  }
}
