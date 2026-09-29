'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { addShoppingItemAction, removeShoppingItemAction, toggleShoppingItemAction, updateShoppingItemAction } from '@/app/actions/shopping'
import type { HouseholdData } from '@/lib/db/queries'
import { applyPendingOps, enqueue, isNetworkError, loadQueue, placeholderItem, remapItemId, saveQueue, tempIdToUuid, type PendingOp } from '@/lib/offline-queue'
import { safeLocalStorage } from '@/lib/safe-storage'

/**
 * Shopping list without a signal (lib/offline-queue.ts).
 * List changes are sent at once when there is a connection. Without one — or while earlier changes
 * still wait — they join a queue stored on the device, stay visible on top of the server's copy,
 * and are sent in order when the connection returns. A change the server refuses (the item was
 * removed by another member meanwhile) is dropped and reported; a lost connection keeps the rest.
 */
export function useShoppingQueue({
  householdId,
  mainListId,
  setItems,
  setNotifications,
}: {
  householdId: string
  mainListId: string
  setItems: Dispatch<SetStateAction<HouseholdData['items']>>
  setNotifications: Dispatch<SetStateAction<HouseholdData['notifications']>>
}) {
  const router = useRouter()
  const queueRef = useRef<PendingOp[]>([])
  const flushingRef = useRef(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(true)
  const [droppedCount, setDroppedCount] = useState(0)

  const setQueue = useCallback(
    (ops: PendingOp[]) => {
      queueRef.current = ops
      saveQueue(safeLocalStorage(), householdId, ops)
      setPendingCount(ops.length)
    },
    [householdId],
  )

  // Sends one change; an offline-added item gets its real id from the server here.
  async function sendOp(op: PendingOp) {
    switch (op.kind) {
      case 'add': {
        const { item, notification } = await addShoppingItemAction(mainListId, op.name, {}, tempIdToUuid(op.tempId))
        setItems((current) => (current.some((entry) => entry.id === op.tempId) ? current.map((entry) => (entry.id === op.tempId ? item : entry)) : [...current, item]))
        queueRef.current = remapItemId(queueRef.current, op.tempId, item.id)
        if (notification) setNotifications((current) => [...current, notification])
        return
      }
      case 'toggle':
        return toggleShoppingItemAction(op.itemId, op.done)
      case 'update':
        return updateShoppingItemAction(op.itemId, op.changes)
      case 'remove':
        return removeShoppingItemAction(op.itemId)
    }
  }

  async function runOrQueue(op: PendingOp) {
    const queueIt = () => {
      if (op.kind === 'add') setItems((current) => [...current, placeholderItem(op.tempId, op.name)])
      setQueue(enqueue(queueRef.current, op))
    }
    // Behind earlier waiting changes, a new one waits too, so the server sees them in order.
    if (queueRef.current.length > 0 || !navigator.onLine) return queueIt()
    try {
      await sendOp(op)
    } catch (error) {
      if (isNetworkError(error, navigator.onLine)) return queueIt()
      console.error('Shopping list change refused', error)
      setDroppedCount((count) => count + 1)
    }
  }

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || queueRef.current.length === 0 || !navigator.onLine) return
    flushingRef.current = true
    let refused = false
    try {
      while (queueRef.current.length > 0) {
        const [op] = queueRef.current
        try {
          await sendOp(op)
        } catch (error) {
          if (isNetworkError(error, navigator.onLine)) return // still offline: keep the rest for later
          console.error('Queued shopping list change refused', error)
          setDroppedCount((count) => count + 1)
          refused = true
        }
        setQueue(queueRef.current.slice(1))
      }
      // Every sent change already updated the list locally, so a refresh is needed only when the
      // server refused one (the item was changed elsewhere) and the local list may now differ.
      if (refused) router.refresh()
    } finally {
      flushingRef.current = false
    }
    // sendOp only uses stable values and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, setQueue])

  useEffect(() => {
    // Restore what was left waiting on this device, and show it on top of the server's copy.
    const stored = loadQueue(safeLocalStorage(), householdId)
    if (stored.length > 0) {
      queueRef.current = stored
      setPendingCount(stored.length)
      setItems((current) => applyPendingOps(current, stored))
    }
    setOnline(navigator.onLine)
    const goOnline = () => {
      setOnline(true)
      void flushQueue()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    void flushQueue()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [householdId, flushQueue, setItems])

  return { queueRef, pendingCount, online, droppedCount, dismissDropped: () => setDroppedCount(0), runOrQueue, flushQueue }
}
