'use client'

import { ChevronRight, PackageX, Search, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { placeKeyOf, quickOutCandidates } from '@/lib/pantry'
import type { PantryItem } from '@/lib/types'

// "Došlo mi…" on the home screen: record that something ran out in two taps, without opening Zásoby.
// The likely-gone items (lib/pantry-estimate.ts) are offered first; typing finds any item at home.
// A tap removes the item from the pantry and, when ticked, puts it on the shopping list — after a few
// seconds, so a mistaken tap can be taken back ("Zpět"). Leaving the screen commits what is waiting.

const UNDO_MS = 5000

type Pending = { item: PantryItem; addToList: boolean; timer: ReturnType<typeof setTimeout> }

export function QuickOutOfStock({
  pantryItems,
  likelyGoneIds,
  onGone,
  onOpenPantry,
}: {
  pantryItems: PantryItem[]
  likelyGoneIds: ReadonlySet<string>
  onGone: (item: PantryItem, addToList: boolean) => void
  /** Opens Zásoby — at the place of the first item that probably ran out, when there is one. */
  onOpenPantry: (placeKey?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [addToList, setAddToList] = useState(true)
  const [pending, setPending] = useState<Pending[]>([])
  const pendingRef = useRef<Pending[]>([])
  pendingRef.current = pending
  const onGoneRef = useRef(onGone)
  onGoneRef.current = onGone

  // Commits whatever is still waiting when the card goes away (another tab, leaving the app).
  useEffect(
    () => () => {
      for (const entry of pendingRef.current) {
        clearTimeout(entry.timer)
        onGoneRef.current(entry.item, entry.addToList)
      }
    },
    [],
  )

  const pendingIds = new Set(pending.map((entry) => entry.item.id))
  const candidates = quickOutCandidates(
    pantryItems.filter((item) => !pendingIds.has(item.id)),
    likelyGoneIds,
    query,
  )
  if (pantryItems.length === 0) return null

  function markGone(item: PantryItem) {
    const timer = setTimeout(() => {
      setPending((current) => current.filter((entry) => entry.item.id !== item.id))
      onGoneRef.current(item, addToList)
    }, UNDO_MS)
    setPending((current) => [...current, { item, addToList, timer }])
    setQuery('')
  }

  function undo(entry: Pending) {
    clearTimeout(entry.timer)
    setPending((current) => current.filter((other) => other.item.id !== entry.item.id))
  }

  return (
    <section aria-label="Došlo mi" className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PackageX className="size-4 text-accent-text" aria-hidden />
          Došlo mi…
        </h2>
        <button
          type="button"
          onClick={() => {
            const firstGone = pantryItems.find((item) => likelyGoneIds.has(item.id))
            onOpenPantry(firstGone ? placeKeyOf(firstGone) : undefined)
          }}
          className="-mr-2 flex min-h-10 items-center gap-0.5 rounded-lg px-2 text-sm text-fg-muted hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Zásoby <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-input bg-background px-3">
        <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Najít v zásobách"
          aria-label="Najít v zásobách"
          className="min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-muted sm:text-sm"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {candidates.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => markGone(item)}
            className={`min-h-10 max-w-full truncate rounded-full border px-3.5 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${likelyGoneIds.has(item.id) ? 'border-warning/50 bg-warning-subtle text-warning' : 'border-border'}`}
          >
            {item.name}
          </button>
        ))}
        {candidates.length === 0 && <p className="text-sm text-fg-muted">{query ? 'V zásobách nic takového není.' : 'Nic dalšího v zásobách.'}</p>}
      </div>
      <label className="mt-3 flex min-h-10 items-center gap-2 text-sm text-fg-secondary">
        <input type="checkbox" checked={addToList} onChange={(event) => setAddToList(event.target.checked)} className="size-4 accent-[var(--accent-solid)]" />
        Přidat i na nákupní seznam
      </label>
      {pending.length > 0 && (
        <ul className="mt-3 space-y-1.5" role="status" aria-live="polite">
          {pending.map((entry) => (
            <li key={entry.item.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
              <span className="min-w-0 truncate">
                {entry.item.name}: došlo{entry.addToList ? ', přidám na seznam' : ''}
              </span>
              <button type="button" onClick={() => undo(entry)} className="flex min-h-9 shrink-0 items-center gap-1 px-1 font-medium text-accent-text">
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Zpět
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
