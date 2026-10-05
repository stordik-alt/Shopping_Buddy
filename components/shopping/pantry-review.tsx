import { Check, ClipboardCheck, Minus, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { itemCountLabel } from '@/lib/format'
import { needsCheck, PANTRY_QUANTITY_STEP, pantryPlaceOptions, pantryReviewOrder, placeKeyOf, splitPantryReview, type PantryQuantityChange } from '@/lib/pantry'
import { estimateReason, type ConsumptionEstimate } from '@/lib/pantry-estimate'
import { cn } from '@/lib/utils'
import type { PantryItem, PantryPlace } from '@/lib/types'

// "Zkontrolovat zásoby": the whole check in one pass instead of confirming or removing row by row.
// Every item starts as "Mám" — except those estimated as used up (lib/pantry-estimate.ts), which
// start as "Došlo", so when the estimate is right the household only presses Save. They tap only
// what differs and save once. What ran out is
// removed (and, if they want, added to the shopping list); everything else is confirmed, which
// restarts its check-in clock. The split and the order are pure (lib/pantry.ts); the save is one
// server action (reviewPantryAction) that checks every id against the household.

type Scope = 'location' | 'uncertain' | 'all'

export type PantryReviewResult = { removed: number; confirmed: number; adjusted: number; addedToList: number; listFailed: boolean }

export function PantryReview({
  items,
  customPlaces,
  placeKey,
  placeLabel,
  initialScope = 'location',
  estimates,
  onSave,
  onClose,
}: {
  items: PantryItem[]
  /** The household's own places, beyond the fixed locations. */
  customPlaces: PantryPlace[]
  /** The folder the check was opened from (a `PantryPlaceOption.key`); the check can be widened to
   *  the whole pantry. */
  placeKey: string
  /** That folder's display name. */
  placeLabel: string
  /** 'uncertain' = only the items asked about or estimated as used up. */
  initialScope?: Scope
  estimates: Map<string, ConsumptionEstimate>
  onSave: (reviewedIds: string[], goneIds: string[], addGoneToList: boolean, quantities: PantryQuantityChange[]) => Promise<PantryReviewResult>
  onClose: (result: PantryReviewResult | null) => void
}) {
  const options = useMemo(() => pantryPlaceOptions(customPlaces), [customPlaces])
  const [scope, setScope] = useState<Scope>(initialScope)
  const likelyGone = useMemo(() => new Set([...estimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [estimates])
  // Pre-marked once, when the check opens; the household's taps are never overwritten afterwards.
  const [gone, setGone] = useState<Set<string>>(() => new Set(likelyGone))
  // What is left of an item that stays, when the household changed it ("had 4, 1 left"); absent = unchanged.
  const [remaining, setRemaining] = useState<Map<string, number>>(() => new Map())
  const [addToList, setAddToList] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The check opens below the location tiles; bring it into view (opened from the banner or the
  // weekly notification's link, the household should land on it, not on the tiles).
  const sectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Grouped by place in the folders' order; within a place the likely-gone items come first.
  const groups = useMemo(() => {
    const inScope = scope === 'all' ? items : scope === 'uncertain' ? items.filter((item) => needsCheck(item, likelyGone)) : items.filter((item) => placeKeyOf(item) === placeKey)
    return options
      .map((option) => ({ place: option.name, items: pantryReviewOrder(inScope.filter((item) => placeKeyOf(item) === option.key)) }))
      .filter((group) => group.items.length > 0)
  }, [items, options, placeKey, scope, likelyGone])
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
    // Back to "Mám" (or to "Došlo") starts from the recorded amount again.
    setRemaining((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  // −/+ on an item that stays. Going down to nothing means it ran out: the row turns "Došlo".
  function changeRemaining(item: PantryItem, direction: 1 | -1) {
    const current = remaining.get(item.id) ?? item.quantity
    const next = Math.round((current + direction * PANTRY_QUANTITY_STEP[item.unit]) * 1000) / 1000
    if (next <= 0) {
      toggle(item.id)
      return
    }
    setRemaining((map) => new Map(map).set(item.id, next))
  }

  const quantityChanges: PantryQuantityChange[] = keptIds
    .map((id) => ({ id, quantity: remaining.get(id) }))
    .filter((change): change is PantryQuantityChange => change.quantity !== undefined && change.quantity !== items.find((item) => item.id === change.id)?.quantity)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      onClose(
        await onSave(
          reviewed.map((item) => item.id),
          goneIds,
          addToList,
          quantityChanges,
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
          <ClipboardCheck className="size-4 shrink-0 text-accent-text" aria-hidden />
          <h2 className="text-sm font-semibold">Kontrola zásob</h2>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-fg-secondary">Klepněte na to, co už doma není, a u ostatního případně −/+ upravte, kolik zbývá. Zbytek se po uložení potvrdí jako „Mám“.</p>
        <div role="radiogroup" aria-label="Rozsah kontroly" className="mt-3 inline-flex max-w-full flex-wrap rounded-full bg-muted p-1 text-sm">
          {(
            [
              ['uncertain', 'K ověření'],
              ['location', placeLabel],
              ['all', 'Vše'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              onClick={() => setScope(value)}
              className={cn('min-h-10 rounded-full px-4 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', scope === value ? 'bg-card text-foreground shadow-sm' : 'text-fg-secondary hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {reviewed.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{scope === 'uncertain' ? 'Nic nečeká na ověření — přepněte na „Vše“, pokud chcete projít všechno.' : 'Tady není co kontrolovat.'}</p>}

      {groups.map((group) => (
        <div key={group.place}>
          {scope !== 'location' && <h3 className="bg-muted/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.place}</h3>}
          <ul>
            {group.items.map((item) => {
              const isGone = gone.has(item.id)
              const left = remaining.get(item.id) ?? item.quantity
              const changed = !isGone && left !== item.quantity
              return (
                // Wraps instead of squeezing: on a narrow phone the amount control moves under the name.
                <li key={item.id} className={cn('flex flex-wrap items-center justify-end gap-x-1 border-b border-border pr-3 last:border-0 sm:pr-4', isGone && 'bg-destructive-subtle/60')}>
                  <button
                    type="button"
                    aria-pressed={isGone}
                    aria-label={`${item.name}: ${isGone ? 'došlo' : 'mám'}`}
                    onClick={() => toggle(item.id)}
                    className={cn('flex min-h-14 min-w-[15rem] flex-1 items-center gap-3 py-2.5 pl-4 text-left transition sm:pl-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', !isGone && 'hover:bg-muted')}
                  >
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                        isGone ? 'bg-destructive-subtle text-destructive' : 'bg-success-subtle text-success',
                      )}
                    >
                      {isGone ? <X className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                      {isGone ? 'Došlo' : 'Mám'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words text-sm font-medium', isGone && 'text-fg-muted line-through')}>{item.name}</span>
                      <span className="mt-0.5 block text-xs text-fg-muted">
                        {changed ? `bylo ${item.quantity} ${item.unit}` : `${item.quantity} ${item.unit}`}
                        {estimates.get(item.id)?.likelyGone ? ` · Asi došlo, ${estimateReason(estimates.get(item.id)!)}` : item.askedAt ? ' · Máte ještě?' : ''}
                      </span>
                    </span>
                  </button>
                  {!isGone && (
                    // How much is left, when only part was used ("had 4, 1 left").
                    <span className="flex shrink-0 items-center gap-0.5 pb-1 sm:pb-0" role="group" aria-label={`Zbývá: ${item.name}`}>
                      <span className="mr-1 text-xs text-fg-muted" aria-hidden="true">
                        zbývá
                      </span>
                      <button type="button" aria-label={`Méně: ${item.name}`} onClick={() => changeRemaining(item, -1)} className="icon-button">
                        <Minus className="size-4" aria-hidden="true" />
                      </button>
                      <span className={cn('min-w-12 text-center text-sm tabular-nums', changed ? 'font-semibold text-accent-text' : 'text-fg-secondary')} aria-live="polite">
                        {left} {item.unit}
                      </span>
                      <button type="button" aria-label={`Více: ${item.name}`} onClick={() => changeRemaining(item, 1)} className="icon-button">
                        <Plus className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {/* Stays in reach above the phone's bottom navigation while scrolling a long pantry. The section
          clips with overflow-clip, not overflow-hidden: a hidden overflow would make the section the
          sticky container and pin this bar over the last rows. */}
      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 border-t border-border bg-surface-elevated/95 px-5 py-3 backdrop-blur lg:bottom-0">
        {goneIds.length > 0 && (
          <label className="mb-2 flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={addToList} onChange={(event) => setAddToList(event.target.checked)} className="size-5 accent-[var(--accent-solid)]" />
            Co došlo, přidat na nákupní seznam
          </label>
        )}
        {error && (
          <p role="alert" className="mb-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted" aria-live="polite">
            Došlo: {itemCountLabel(goneIds.length)} · Mám: {itemCountLabel(keptIds.length)}
            {quantityChanges.length > 0 ? ` · upraveno množství: ${quantityChanges.length}` : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" onClick={() => onClose(null)} disabled={saving}>
              Zrušit
            </Button>
            <Button size="lg" onClick={save} disabled={saving || reviewed.length === 0}>
              {saving ? 'Ukládám…' : 'Uložit kontrolu'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
