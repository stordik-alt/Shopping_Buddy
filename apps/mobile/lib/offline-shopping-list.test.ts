import { describe, expect, it, vi } from 'vitest'
import {
  applyOfflineOperations,
  createOfflineItemId,
  enqueueOfflineOperation,
  parseOfflineSnapshot,
  syncOfflineOperations,
  type OfflineShoppingSnapshot,
} from './offline-shopping-list'

const item = (id: string, overrides: Partial<OfflineShoppingSnapshot['list']['items'][number]> = {}) => ({
  id,
  name: id,
  quantity: 1,
  unit: 'ks' as const,
  done: false,
  ...overrides,
})

const snapshot = (pending: OfflineShoppingSnapshot['pending'] = []): OfflineShoppingSnapshot => ({
  version: 1,
  userId: 'user-1',
  householdId: 'household-1',
  list: { listId: 'list-1', shoppingLists: ['Nákup'], items: [item('milk')] },
  pending,
})

describe('offline shopping list', () => {
  it('creates stable-format temporary ids and overlays queued changes in order', () => {
    const id = createOfflineItemId(() => 0.5)
    const operations: OfflineShoppingSnapshot['pending'] = [
      { kind: 'add', item: item(id, { name: 'Sůl' }) },
      { kind: 'toggle', itemId: 'milk', done: true },
      { kind: 'update', itemId: 'milk', changes: { quantity: 2, unit: 'kg' } },
    ]

    expect(id).toMatch(/^offline-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(applyOfflineOperations(snapshot().list.items, operations)).toEqual([
      item('milk', { done: true, quantity: 2, unit: 'kg', pending: true }),
      item(id, { name: 'Sůl', pending: true }),
    ])
  })

  it('folds repeated absolute updates and completion changes', () => {
    let operations: OfflineShoppingSnapshot['pending'] = []
    operations = enqueueOfflineOperation(operations, { kind: 'update', itemId: 'milk', changes: { quantity: 2 } })
    operations = enqueueOfflineOperation(operations, { kind: 'toggle', itemId: 'milk', done: true })
    operations = enqueueOfflineOperation(operations, { kind: 'update', itemId: 'milk', changes: { unit: 'l' } })
    operations = enqueueOfflineOperation(operations, { kind: 'toggle', itemId: 'milk', done: false })

    expect(operations).toEqual([
      { kind: 'update', itemId: 'milk', changes: { quantity: 2, unit: 'l' } },
      { kind: 'toggle', itemId: 'milk', done: false },
    ])
  })

  it('rejects corrupted snapshots and snapshots belonging to another user or household', () => {
    const serialized = JSON.stringify(snapshot())
    expect(parseOfflineSnapshot(serialized, 'user-2', 'household-1')).toBeNull()
    expect(parseOfflineSnapshot(serialized, 'user-1', 'household-2')).toBeNull()
    expect(parseOfflineSnapshot('{broken', 'user-1', 'household-1')).toBeNull()
  })

  it('replays adds with their stable client id and remaps later operations to the server id', async () => {
    const temporaryId = createOfflineItemId()
    const initial = snapshot([
      { kind: 'add', item: item(temporaryId, { name: 'Máslo' }) },
      { kind: 'toggle', itemId: temporaryId, done: true },
    ])
    const api = {
      add: vi.fn().mockResolvedValue({ item: item('server-id', { name: 'Máslo' }) }),
      toggle: vi.fn().mockResolvedValue({ ok: true }),
      update: vi.fn(),
    }
    const persist = vi.fn().mockResolvedValue(undefined)

    const result = await syncOfflineOperations(initial, api, persist)

    expect(api.add).toHaveBeenCalledWith('Máslo', temporaryId.slice('offline-'.length), 1, 'ks')
    expect(api.toggle).toHaveBeenCalledWith('server-id', true)
    expect(result).toMatchObject({ rejected: 0, retryRequired: false, snapshot: { pending: [] } })
    expect(result.snapshot.list.items).toContainEqual(item('server-id', { name: 'Máslo' }))
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('keeps the requested amount and unit when syncing a queued add', async () => {
    const temporaryId = createOfflineItemId()
    const initial = snapshot([{ kind: 'add', item: item(temporaryId, { name: 'Mléko', quantity: 1.5, unit: 'l' }) }])
    const api = {
      add: vi.fn().mockResolvedValue({ item: item('server-id', { name: 'Mléko', quantity: 1.5, unit: 'l' }) }),
      toggle: vi.fn(),
      update: vi.fn(),
    }

    await syncOfflineOperations(initial, api, vi.fn().mockResolvedValue(undefined))

    expect(api.add).toHaveBeenCalledWith('Mléko', temporaryId.slice('offline-'.length), 1.5, 'l')
  })

  it('keeps the failed operation and later changes for retry after a network error', async () => {
    const initial = snapshot([
      { kind: 'toggle', itemId: 'milk', done: true },
      { kind: 'update', itemId: 'milk', changes: { quantity: 2 } },
    ])
    const api = {
      add: vi.fn(),
      toggle: vi.fn().mockRejectedValue({ status: 0, code: 'network_error' }),
      update: vi.fn(),
    }
    const persist = vi.fn().mockResolvedValue(undefined)

    const result = await syncOfflineOperations(initial, api, persist)

    expect(result).toMatchObject({ rejected: 0, retryRequired: true, snapshot: { pending: initial.pending } })
    expect(api.update).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('drops a permanently rejected change, persists the refusal, and continues syncing', async () => {
    const initial = snapshot([
      { kind: 'toggle', itemId: 'removed-item', done: true },
      { kind: 'update', itemId: 'milk', changes: { quantity: 3 } },
    ])
    const api = {
      add: vi.fn(),
      toggle: vi.fn().mockRejectedValue({ status: 404, code: 'not_found' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    }
    const persist = vi.fn().mockResolvedValue(undefined)

    const result = await syncOfflineOperations(initial, api, persist)

    expect(api.update).toHaveBeenCalledWith('milk', { quantity: 3 })
    expect(result).toMatchObject({ rejected: 1, retryRequired: false, snapshot: { pending: [] } })
    expect(persist).toHaveBeenCalledTimes(2)
  })
})
