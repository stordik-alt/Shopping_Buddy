import type { Item } from '@/lib/types'

// The shopping list without a signal. In a shop the phone often has none, and a change the server
// never received used to vanish: the tick stayed on screen until the next refresh replaced the list
// with the server's copy. Changes made while offline (or while earlier ones are still waiting) are
// kept here, in order, stored on the device, shown on top of whatever the server last sent, and sent
// when the connection is back (components/app-shell.tsx). Pure except for the storage helpers at the
// end, so the rules are tested (offline-queue.test.ts).

export type ItemChanges = Partial<Pick<Item, 'quantity' | 'price' | 'unit' | 'category' | 'priority' | 'note' | 'onSale' | 'store'>>

export type PendingOp =
  | { kind: 'toggle'; itemId: string; done: boolean }
  | { kind: 'update'; itemId: string; changes: ItemChanges }
  | { kind: 'remove'; itemId: string }
  /** An item added offline, known by a temporary id until the server gives it a real one. */
  | { kind: 'add'; tempId: string; name: string }

const TEMP_PREFIX = 'offline-'

export function newTempId(): string {
  return `${TEMP_PREFIX}${crypto.randomUUID()}`
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX)
}

/** How an item added offline looks until the server has it: the typed name, the usual defaults. */
export function placeholderItem(tempId: string, name: string): Item {
  return { id: tempId, name, detail: 'čeká na signál', price: 0, quantity: 1, unit: 'ks', category: 'Ostatní', done: false, color: 'bg-muted', priority: 'Normální' }
}

/** The list as the household should see it: the server's latest copy with the waiting changes applied
 *  in order. An operation on an item the server no longer has (another member removed it) is skipped. */
export function applyPendingOps(items: Item[], ops: PendingOp[]): Item[] {
  let result = [...items]
  for (const op of ops) {
    switch (op.kind) {
      case 'add':
        if (!result.some((item) => item.id === op.tempId)) result.push(placeholderItem(op.tempId, op.name))
        break
      case 'toggle':
        result = result.map((item) => (item.id === op.itemId ? { ...item, done: op.done } : item))
        break
      case 'update':
        result = result.map((item) => (item.id === op.itemId ? { ...item, ...op.changes } : item))
        break
      case 'remove':
        result = result.filter((item) => item.id !== op.itemId)
        break
    }
  }
  return result
}

/** Adds an operation, folding it into what is already waiting so the queue stays short and replays
 *  only what matters: the last tick of an item wins, updates merge, removing an item drops its earlier
 *  operations, and removing an item that was added offline drops it entirely (the server never needs
 *  to hear of it). */
export function enqueue(ops: PendingOp[], op: PendingOp): PendingOp[] {
  if (op.kind === 'add') return [...ops, op]
  if (op.kind === 'remove') {
    const withoutItem = ops.filter((existing) => !(existing.kind !== 'add' && existing.itemId === op.itemId))
    if (isTempId(op.itemId)) return withoutItem.filter((existing) => !(existing.kind === 'add' && existing.tempId === op.itemId))
    return [...withoutItem, op]
  }
  if (op.kind === 'toggle') return [...ops.filter((existing) => !(existing.kind === 'toggle' && existing.itemId === op.itemId)), op]
  const previous = ops.find((existing): existing is Extract<PendingOp, { kind: 'update' }> => existing.kind === 'update' && existing.itemId === op.itemId)
  if (!previous) return [...ops, op]
  return ops.map((existing) => (existing === previous ? { ...previous, changes: { ...previous.changes, ...op.changes } } : existing))
}

/** After an offline-added item got its real id, the waiting operations that refer to it use that id. */
export function remapItemId(ops: PendingOp[], tempId: string, realId: string): PendingOp[] {
  return ops.map((op) => (op.kind !== 'add' && op.itemId === tempId ? { ...op, itemId: realId } : op))
}

/** Whether a failed server call means "no connection" (keep the change and retry later) rather than
 *  a real refusal (the item is gone, not allowed — drop the change). A fetch that never reached the
 *  server rejects with a TypeError ("Failed to fetch" / "NetworkError…" / "Load failed"). */
export function isNetworkError(error: unknown, online: boolean): boolean {
  if (!online) return true
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message)
}

// --- Storage on the device -------------------------------------------------------------------

const STORAGE_PREFIX = 'shopping-buddy:offline-queue:v1:'

function isPendingOp(value: unknown): value is PendingOp {
  if (!value || typeof value !== 'object') return false
  const op = value as Record<string, unknown>
  switch (op.kind) {
    case 'add':
      return typeof op.tempId === 'string' && isTempId(op.tempId) && typeof op.name === 'string'
    case 'toggle':
      return typeof op.itemId === 'string' && typeof op.done === 'boolean'
    case 'update':
      return typeof op.itemId === 'string' && typeof op.changes === 'object' && op.changes !== null
    case 'remove':
      return typeof op.itemId === 'string'
    default:
      return false
  }
}

/** The waiting operations of one household on this device; anything unreadable is dropped. Keyed by
 *  household, so another account signed in on the same phone never replays someone else's changes. */
export function loadQueue(storage: Storage | undefined, householdId: string): PendingOp[] {
  try {
    const raw = storage?.getItem(STORAGE_PREFIX + householdId)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isPendingOp) : []
  } catch (error) {
    console.error('Unreadable offline queue, starting empty', error)
    return []
  }
}

export function saveQueue(storage: Storage | undefined, householdId: string, ops: PendingOp[]): void {
  try {
    if (ops.length === 0) storage?.removeItem(STORAGE_PREFIX + householdId)
    else storage?.setItem(STORAGE_PREFIX + householdId, JSON.stringify(ops))
  } catch (error) {
    // Storage full or blocked: the queue still lives in memory for this session.
    console.error('Could not store the offline queue', error)
  }
}
