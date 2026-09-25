'use client'

import { PackageX, Search, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { quickOutCandidates } from '@/lib/pantry'
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
}: {
  pantryItems: PantryItem[]
  likelyGoneIds: ReadonlySet<string>
  onGone: (item: PantryItem, addToList: boolean) => void
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
    <section aria-label="Došlo mi" className="surface p-4">
      <div className="flex items-center gap-2">
        <PackageX className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">Došlo mi…</h2>
      </div>
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-input bg-background px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Najít v zásobách"
          aria-label="Najít v zásobách"
          className="min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {candidates.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => markGone(item)}
            className={`min-h-9 max-w-full truncate rounded-full border px-3 text-xs font-medium transition hover:bg-muted ${likelyGoneIds.has(item.id) ? 'border-destructive/40 text-destructive' : 'border-border'}`}
          >
            {item.name}
          </button>
        ))}
        {candidates.length === 0 && <p className="text-xs text-muted-foreground">{query ? 'V zásobách nic takového není.' : 'Nic dalšího v zásobách.'}</p>}
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={addToList} onChange={(event) => setAddToList(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
        Přidat i na nákupní seznam
      </label>
      {pending.length > 0 && (
        <ul className="mt-3 space-y-1.5" role="status" aria-live="polite">
          {pending.map((entry) => (
            <li key={entry.item.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
              <span className="min-w-0 truncate">
                {entry.item.name}: došlo{entry.addToList ? ', přidám na seznam' : ''}
              </span>
              <button type="button" onClick={() => undo(entry)} className="flex shrink-0 items-center gap-1 font-medium text-primary">
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Zpět
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
