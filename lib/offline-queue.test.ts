import { describe, expect, it } from 'vitest'
import { applyPendingOps, enqueue, isNetworkError, isTempId, loadQueue, newTempId, placeholderItem, remapItemId, saveQueue, type PendingOp } from '@/lib/offline-queue'
import type { Item } from '@/lib/types'

const item = (id: string, overrides: Partial<Item> = {}): Item => ({ id, name: id, detail: '', price: 0, quantity: 1, unit: 'ks', category: 'Potraviny', done: false, color: 'x', priority: 'Normální', ...overrides })

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

describe('applyPendingOps', () => {
  it('shows the waiting changes on top of the server copy, in order', () => {
    const tempId = newTempId()
    const ops: PendingOp[] = [
      { kind: 'toggle', itemId: 'milk', done: true },
      { kind: 'update', itemId: 'bread', changes: { quantity: 3 } },
      { kind: 'remove', itemId: 'eggs' },
      { kind: 'add', tempId, name: 'Máslo' },
    ]
    const result = applyPendingOps([item('milk'), item('bread'), item('eggs')], ops)
    expect(result.map((entry) => [entry.id, entry.done, entry.quantity])).toEqual([
      ['milk', true, 1],
      ['bread', false, 3],
      [tempId, false, 1],
    ])
    expect(result[2]).toMatchObject({ name: 'Máslo', detail: 'čeká na signál' })
  })

  it('skips changes to an item the server no longer has, and never adds the same offline item twice', () => {
    const tempId = newTempId()
    const ops: PendingOp[] = [{ kind: 'toggle', itemId: 'gone', done: true }, { kind: 'add', tempId, name: 'Sůl' }]
    expect(applyPendingOps([item('milk')], ops).map((entry) => entry.id)).toEqual(['milk', tempId])
    expect(applyPendingOps([item('milk'), placeholderItem(tempId, 'Sůl')], ops).filter((entry) => entry.id === tempId)).toHaveLength(1)
  })
})

describe('enqueue', () => {
  it('keeps only the last tick of an item and merges updates', () => {
    let ops: PendingOp[] = []
    ops = enqueue(ops, { kind: 'toggle', itemId: 'a', done: true })
    ops = enqueue(ops, { kind: 'update', itemId: 'a', changes: { quantity: 2 } })
    ops = enqueue(ops, { kind: 'toggle', itemId: 'a', done: false })
    ops = enqueue(ops, { kind: 'update', itemId: 'a', changes: { note: 'bio' } })
    expect(ops).toEqual([
      { kind: 'update', itemId: 'a', changes: { quantity: 2, note: 'bio' } },
      { kind: 'toggle', itemId: 'a', done: false },
    ])
  })

  it('drops earlier changes of a removed item, and an offline-added item removed offline entirely', () => {
    const tempId = newTempId()
    let ops: PendingOp[] = [{ kind: 'toggle', itemId: 'a', done: true }, { kind: 'add', tempId, name: 'Sůl' }, { kind: 'toggle', itemId: tempId, done: true }]
    ops = enqueue(ops, { kind: 'remove', itemId: 'a' })
    ops = enqueue(ops, { kind: 'remove', itemId: tempId })
    expect(ops).toEqual([{ kind: 'remove', itemId: 'a' }])
  })
})

describe('remapItemId', () => {
  it('points the waiting changes of an offline-added item at its real id', () => {
    const tempId = newTempId()
    const ops: PendingOp[] = [{ kind: 'toggle', itemId: tempId, done: true }, { kind: 'toggle', itemId: 'b', done: true }]
    expect(remapItemId(ops, tempId, 'real')).toEqual([
      { kind: 'toggle', itemId: 'real', done: true },
      { kind: 'toggle', itemId: 'b', done: true },
    ])
    expect(isTempId(tempId)).toBe(true)
    expect(isTempId('real')).toBe(false)
  })
})

describe('isNetworkError', () => {
  it('treats a failed fetch or being offline as "retry later", anything else as a refusal', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'), true)).toBe(true) // Safari
    expect(isNetworkError(new Error('Item not found'), false)).toBe(true)
    expect(isNetworkError(new Error('Item not found'), true)).toBe(false)
  })
})

describe('stored queue', () => {
  it('round-trips per household and drops anything unreadable', () => {
    const storage = memoryStorage()
    const ops: PendingOp[] = [{ kind: 'toggle', itemId: 'a', done: true }]
    saveQueue(storage, 'h1', ops)
    expect(loadQueue(storage, 'h1')).toEqual(ops)
    expect(loadQueue(storage, 'h2')).toEqual([]) // another household on the same phone
    storage.setItem('shopping-buddy:offline-queue:v1:h1', JSON.stringify([{ kind: 'toggle', itemId: 'a' }, { kind: 'drop-table' }, ...ops]))
    expect(loadQueue(storage, 'h1')).toEqual(ops)
    storage.setItem('shopping-buddy:offline-queue:v1:h1', '{not json')
    expect(loadQueue(storage, 'h1')).toEqual([])
    saveQueue(storage, 'h1', [])
    expect(storage.getItem('shopping-buddy:offline-queue:v1:h1')).toBeNull()
    expect(loadQueue(undefined, 'h1')).toEqual([])
  })
})
