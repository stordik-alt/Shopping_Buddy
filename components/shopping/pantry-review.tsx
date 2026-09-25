import { Check, ClipboardCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { itemCountLabel } from '@/lib/format'
import { needsCheck, PANTRY_LOCATIONS, pantryReviewOrder, splitPantryReview } from '@/lib/pantry'
import { estimateReason, type ConsumptionEstimate } from '@/lib/pantry-estimate'
import { cn } from '@/lib/utils'
import type { PantryItem, PantryLocation } from '@/lib/types'

// "Zkontrolovat zásoby": the whole check in one pass instead of confirming or removing row by row.
// Every item starts as "Mám" — except those estimated as used up (lib/pantry-estimate.ts), which
// start as "Došlo", so when the estimate is right the household only presses Save. They tap only
// what differs and save once. What ran out is
// removed (and, if they want, added to the shopping list); everything else is confirmed, which
// restarts its check-in clock. The split and the order are pure (lib/pantry.ts); the save is one
// server action (reviewPantryAction) that checks every id against the household.

type Scope = 'location' | 'uncertain' | 'all'

export type PantryReviewResult = { removed: number; confirmed: number; addedToList: number; listFailed: boolean }

export function PantryReview({
  items,
  location,
  initialScope = 'location',
  estimates,
  onSave,
  onClose,
}: {
  items: PantryItem[]
  /** The folder the check was opened from; the check can be widened to the whole pantry. */
  location: PantryLocation
  /** 'uncertain' = only the items asked about or estimated as used up. */
  initialScope?: Scope
  estimates: Map<string, ConsumptionEstimate>
  onSave: (reviewedIds: string[], goneIds: string[], addGoneToList: boolean) => Promise<PantryReviewResult>
  onClose: (result: PantryReviewResult | null) => void
}) {
  const [scope, setScope] = useState<Scope>(initialScope)
  const likelyGone = useMemo(() => new Set([...estimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [estimates])
  // Pre-marked once, when the check opens; the household's taps are never overwritten afterwards.
  const [gone, setGone] = useState<Set<string>>(() => new Set(likelyGone))
  const [addToList, setAddToList] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The check opens below the location tiles; bring it into view (opened from the banner or the
  // weekly notification's link, the household should land on it, not on the tiles).
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Grouped by location in the folders' order; within a location the likely-gone items come first.
  const groups = useMemo(() => {
    const inScope = scope === 'all' ? items : scope === 'uncertain' ? items.filter((item) => needsCheck(item, likelyGone)) : items.filter((item) => item.location === location)
    return PANTRY_LOCATIONS.map((place) => ({ place, items: pantryReviewOrder(inScope.filter((item) => item.location === place)) })).filter((group) => group.items.length > 0)
  }, [items, location, scope, likelyGone])
  const reviewed = groups.flatMap((group) => group.items)
  const { goneIds, keptIds } = splitPantryReview(
    reviewed.map((item) => item.id),
    gone,
  )

  function toggle(id: string) {
    setGone((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      onClose(
        await onSave(
          reviewed.map((item) => item.id),
          goneIds,
          addToList,
        ),
      )
    } catch (err) {
      console.error('Pantry review failed', err)
      setError('Kontrolu se nepodařilo uložit. Nic se nezměnilo, zkuste to prosím znovu.')
      setSaving(false)
    }
  }

  return (
    <section ref={sectionRef} aria-label="Kontrola zásob" className="surface scroll-mt-20 overflow-clip">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Kontrola zásob</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Klepněte jen na to, co už doma není. Všechno ostatní se po uložení potvrdí jako „Mám“.</p>
        <div role="radiogroup" aria-label="Rozsah kontroly" className="mt-3 inline-flex rounded-full border border-border p-0.5 text-xs">
          {(
            [
              ['uncertain', 'K ověření'],
              ['location', location],
              ['all', 'Vše'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              onClick={() => setScope(value)}
              className={cn('min-h-8 rounded-full px-3 font-medium transition', scope === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {reviewed.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{scope === 'uncertain' ? 'Nic nečeká na ověření — přepněte na „Vše“, pokud chcete projít všechno.' : 'Tady není co kontrolovat.'}</p>}

      {groups.map((group) => (
        <div key={group.place}>
          {scope !== 'location' && <h3 className="bg-muted/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.place}</h3>}
          <ul>
            {group.items.map((item) => {
              const isGone = gone.has(item.id)
              return (
                <li key={item.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    aria-pressed={isGone}
                    aria-label={`${item.name}: ${isGone ? 'došlo' : 'mám'}`}
                    onClick={() => toggle(item.id)}
                    className={cn('flex min-h-12 w-full items-center gap-3 px-5 py-2.5 text-left transition', isGone ? 'bg-destructive/5' : 'hover:bg-muted')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words text-sm font-medium', isGone && 'text-muted-foreground line-through')}>{item.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.quantity} {item.unit}
                        {estimates.get(item.id)?.likelyGone ? ` · Asi došlo, ${estimateReason(estimates.get(item.id)!)}` : item.askedAt ? ' · Máte ještě?' : ''}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                        isGone ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                      )}
                    >
                      {isGone ? <X className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                      {isGone ? 'Došlo' : 'Mám'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {/* Stays in reach above the phone's bottom navigation while scrolling a long pantry. The section
          clips with overflow-clip, not overflow-hidden: a hidden overflow would make the section the
          sticky container and pin this bar over the last rows. */}
      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-popover/95 px-5 py-3 backdrop-blur lg:bottom-0">
        {goneIds.length > 0 && (
          <label className="mb-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={addToList} onChange={(event) => setAddToList(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Co došlo, přidat na nákupní seznam
          </label>
        )}
        {error && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Došlo: {itemCountLabel(goneIds.length)} · Mám: {itemCountLabel(keptIds.length)}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onClose(null)} disabled={saving} className="min-h-10 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60">
              Zrušit
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || reviewed.length === 0}
              className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? 'Ukládám…' : 'Uložit kontrolu'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
