import { ITEM_UNITS, type ItemUnit } from '@anitka/shared/units'
import type { MobileShoppingItem, MobileShoppingList } from './shopping-list-api'

export type OfflineShoppingOperation =
  | { kind: 'add'; item: MobileShoppingItem }
  | { kind: 'toggle'; itemId: string; done: boolean }
  | { kind: 'update'; itemId: string; changes: { quantity?: number; unit?: ItemUnit } }

export type OfflineShoppingSnapshot = {
  version: 1
  userId: string
  householdId: string
  list: MobileShoppingList
  pending: OfflineShoppingOperation[]
}

export type OfflineContext = {
  userId: string
  householdId: string
  userName: string
}

export type OfflineShoppingApi = {
  add: (name: string, clientId: string, quantity?: number, unit?: ItemUnit) => Promise<{ item: MobileShoppingItem }>
  toggle: (itemId: string, done: boolean) => Promise<unknown>
  update: (itemId: string, changes: { quantity?: number; unit?: ItemUnit }) => Promise<unknown>
}

export type OfflineSyncResult = {
  snapshot: OfflineShoppingSnapshot
  rejected: number
  rejectedNotFound: number
  retryRequired: boolean
  error?: unknown
}

const OFFLINE_ITEM_PREFIX = 'offline-'

export function createOfflineItemId(random = Math.random): string {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(random() * 16)
    return (character === 'x' ? value : (value & 3) | 8).toString(16)
  })
  return `${OFFLINE_ITEM_PREFIX}${uuid}`
}

export function enqueueOfflineOperation(
  operations: OfflineShoppingOperation[],
  operation: OfflineShoppingOperation,
): OfflineShoppingOperation[] {
  if (operation.kind === 'add') {
    return operations.some((entry) => entry.kind === 'add' && entry.item.id === operation.item.id)
      ? operations
      : [...operations, operation]
  }

  if (operation.kind === 'toggle') {
    return [...operations.filter((entry) => !(entry.kind === 'toggle' && entry.itemId === operation.itemId)), operation]
  }

  const previous = operations.find(
    (entry): entry is Extract<OfflineShoppingOperation, { kind: 'update' }> =>
      entry.kind === 'update' && entry.itemId === operation.itemId,
  )
  if (!previous) return [...operations, operation]
  return operations.map((entry) =>
    entry === previous ? { ...previous, changes: { ...previous.changes, ...operation.changes } } : entry,
  )
}

export function applyOfflineOperations(
  items: MobileShoppingItem[],
  operations: OfflineShoppingOperation[],
): MobileShoppingItem[] {
  let visible = items
  for (const operation of operations) {
    if (operation.kind === 'add') {
      if (!visible.some((item) => item.id === operation.item.id)) {
        visible = [...visible, { ...operation.item, pending: true }]
      }
    } else if (operation.kind === 'toggle') {
      visible = visible.map((item) =>
        item.id === operation.itemId ? { ...item, done: operation.done, pending: true } : item,
      )
    } else {
      visible = visible.map((item) =>
        item.id === operation.itemId ? { ...item, ...operation.changes, pending: true } : item,
      )
    }
  }
  return visible
}

export function parseOfflineSnapshot(
  raw: string,
  userId: string,
  householdId: string,
): OfflineShoppingSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const snapshot = value as Partial<OfflineShoppingSnapshot>
    if (
      snapshot.version !== 1 ||
      snapshot.userId !== userId ||
      snapshot.householdId !== householdId ||
      !snapshot.list ||
      typeof snapshot.list.listId !== 'string' ||
      !Array.isArray(snapshot.list.items) ||
      !Array.isArray(snapshot.list.shoppingLists) ||
      !snapshot.list.shoppingLists.every((name) => typeof name === 'string') ||
      !Array.isArray(snapshot.pending)
    ) return null

    const items = snapshot.list.items.filter(isMobileShoppingItem)
    const pending = snapshot.pending.filter(isOfflineShoppingOperation)
    return {
      version: 1,
      userId,
      householdId,
      list: { ...snapshot.list, items } as MobileShoppingList,
      pending,
    }
  } catch {
    return null
  }
}

export function isRetryableOfflineError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return true
  const status = (error as { status?: unknown }).status
  return typeof status !== 'number' || (status !== 400 && status !== 404)
}

export async function syncOfflineOperations(
  initial: OfflineShoppingSnapshot,
  api: OfflineShoppingApi,
  persist: (snapshot: OfflineShoppingSnapshot) => Promise<void>,
): Promise<OfflineSyncResult> {
  let snapshot = initial
  let rejected = 0
  let rejectedNotFound = 0

  while (snapshot.pending.length > 0) {
    const [operation, ...remaining] = snapshot.pending
    try {
      let list = snapshot.list
      let pending = remaining
      if (operation.kind === 'add') {
        const clientId = operation.item.id.slice(OFFLINE_ITEM_PREFIX.length)
        const result = await api.add(operation.item.name, clientId, operation.item.quantity, operation.item.unit)
        list = {
          ...list,
          items: list.items.some((item) => item.id === operation.item.id)
            ? list.items.map((item) => item.id === operation.item.id ? result.item : item)
            : [...list.items, result.item],
        }
        pending = remaining.map((entry) =>
          entry.kind !== 'add' && entry.itemId === operation.item.id
            ? { ...entry, itemId: result.item.id }
            : entry,
        )
      } else if (operation.kind === 'toggle') {
        await api.toggle(operation.itemId, operation.done)
      } else {
        await api.update(operation.itemId, operation.changes)
      }

      snapshot = { ...snapshot, list, pending }
      await persist(snapshot)
    } catch (error) {
      if (isRetryableOfflineError(error)) {
        return { snapshot, rejected, rejectedNotFound, retryRequired: true, error }
      }
      snapshot = { ...snapshot, pending: remaining }
      rejected += 1
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 404) {
        rejectedNotFound += 1
      }
      await persist(snapshot)
    }
  }

  return { snapshot, rejected, rejectedNotFound, retryRequired: false }
}

function isMobileShoppingItem(value: unknown): value is MobileShoppingItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MobileShoppingItem>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.quantity === 'number' &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    item.quantity < 10_000_000 &&
    typeof item.unit === 'string' &&
    ITEM_UNITS.includes(item.unit as ItemUnit) &&
    typeof item.done === 'boolean'
  )
}

function isOfflineShoppingOperation(value: unknown): value is OfflineShoppingOperation {
  if (!value || typeof value !== 'object') return false
  const operation = value as Record<string, unknown>
  if (operation.kind === 'add') {
    return (
      isMobileShoppingItem(operation.item) &&
      /^offline-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.item.id)
    )
  }
  if (operation.kind === 'toggle') {
    return typeof operation.itemId === 'string' && typeof operation.done === 'boolean'
  }
  if (operation.kind === 'update' && typeof operation.itemId === 'string' && operation.changes && typeof operation.changes === 'object') {
    const changes = operation.changes as Record<string, unknown>
    return (
      (changes.quantity === undefined || (typeof changes.quantity === 'number' && Number.isFinite(changes.quantity) && changes.quantity > 0 && changes.quantity < 10_000_000)) &&
      (changes.unit === undefined || (typeof changes.unit === 'string' && ITEM_UNITS.includes(changes.unit as ItemUnit))) &&
      Object.keys(changes).length > 0 &&
      Object.keys(changes).every((key) => key === 'quantity' || key === 'unit')
    )
  }
  return false
}
