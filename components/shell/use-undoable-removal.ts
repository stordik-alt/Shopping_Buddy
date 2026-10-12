'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { itemCountLabel } from '@/lib/format'
import type { Item } from '@/lib/types'

/** How long "Vrátit zpět" stays available before the removal is really sent to the server. */
export const UNDO_WINDOW_MS = 6000

export type UndoNotice = { message: string }

type Pending = { removed: { item: Item; index: number }[]; timer: number }

/**
 * Removing list items with a way back.
 *
 * The items leave the list at once, but the server is told only after `UNDO_WINDOW_MS`. "Vrátit
 * zpět" inside that window simply puts the items back where they were — nothing was deleted yet, so
 * no item has to be re-created (with a new id, side effects and lost quantity/note/store).
 * If the page is closed within the window the removal is never sent, which fails safe: the items are
 * still on the list next time. A second removal commits the first one immediately, so at most one
 * removal is ever waiting.
 */
export function useUndoableRemoval({
  items,
  setItems,
  commit,
}: {
  items: Item[]
  setItems: Dispatch<SetStateAction<Item[]>>
  /** Really removes one item (sent to the server, or queued while offline). */
  commit: (id: string) => void
}) {
  const [notice, setNotice] = useState<UndoNotice | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  // The latest list, so a handler can read each item's position without being recreated on every change.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const commitRef = useRef(commit)
  commitRef.current = commit

  const commitPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pendingRef.current = null
    setNotice(null)
    for (const { item } of pending.removed) commitRef.current(item.id)
  }, [])

  const removeWithUndo = useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids)
      // Settle an earlier removal first; its items are already gone from the list.
      commitPending()
      const removed = itemsRef.current.flatMap((item, index) => (wanted.has(item.id) ? [{ item, index }] : []))
      if (removed.length === 0) return
      setItems((current) => current.filter((item) => !wanted.has(item.id)))
      pendingRef.current = { removed, timer: window.setTimeout(commitPending, UNDO_WINDOW_MS) }
      setNotice({
        message: removed.length === 1 ? `„${removed[0].item.name}“ odstraněno ze seznamu` : `Odstraněno ze seznamu: ${itemCountLabel(removed.length)}`,
      })
    },
    [commitPending, setItems],
  )

  const undo = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pendingRef.current = null
    setNotice(null)
    // Back in the original order: ascending positions, each clamped to the current length.
    setItems((current) => {
      const next = [...current]
      for (const { item, index } of pending.removed) next.splice(Math.min(index, next.length), 0, item)
      return next
    })
  }, [setItems])

  /** True while the item is hidden but not yet removed on the server, so a fresh server copy of the
   *  list must not bring it back. */
  const isPendingRemoval = useCallback((id: string) => pendingRef.current?.removed.some(({ item }) => item.id === id) ?? false, [])

  useEffect(() => {
    // Leaving the app within the window still sends the removal where the browser allows it.
    window.addEventListener('pagehide', commitPending)
    return () => {
      window.removeEventListener('pagehide', commitPending)
      commitPending()
    }
  }, [commitPending])

  return { notice, removeWithUndo, undo, isPendingRemoval }
}
