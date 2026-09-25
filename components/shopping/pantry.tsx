import { BriefcaseMedical, Check, ClipboardCheck, House, Minus, Package, Plus, Refrigerator, Snowflake, SprayCan, Wheat, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PantryReview, type PantryReviewResult } from '@/components/shopping/pantry-review'
import { itemCountLabel } from '@/lib/format'
import { needsCheck, PANTRY_LOCATIONS, PANTRY_TRACKING, summarizeByLocation } from '@/lib/pantry'
import { estimateReason, type ConsumptionEstimate } from '@/lib/pantry-estimate'
import { cn } from '@/lib/utils'
import type { ItemUnit, PantryItem, PantryLocation, PantryTracking } from '@/lib/types'

// One distinct, meaningful icon per location so folders can be told apart at a glance on a phone.
// `satisfies Record<PantryLocation, …>` makes adding a location without an icon a compile error.
const LOCATION_ICON = {
  Spíž: Wheat,
  Lednice: Refrigerator,
  Mrazák: Snowflake,
  Domácnost: House,
  Lékárnička: BriefcaseMedical,
  Drogérka: SprayCan,
} satisfies Record<PantryLocation, LucideIcon>

// −/+ step size: whole units for "ks" (you don't buy 0.3 of a countable item), a tenth for
// weight/volume units — matches how the household would actually type a correction (section 7).
const STEP_BY_UNIT: Record<ItemUnit, number> = { ks: 1, kg: 0.1, g: 10, l: 0.1, ml: 10 }

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** The −/+/exact-value quantity control for one pantry row. Keeps its own draft text while the
 *  household is typing an exact amount (e.g. "1.5" for kg), only committing on blur/Enter so a
 *  half-typed decimal isn't clamped mid-keystroke; the +/- buttons commit immediately since
 *  there's nothing to type. Quantity is clamped to 0 client-side too (defense in depth — the
 *  server, `adjustPantryItemQuantityAction`, is the actual authority and rejects negative values
 *  regardless). */
function QuantityStepper({ quantity, unit, onChange }: { quantity: number; unit: ItemUnit; onChange: (quantity: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const step = STEP_BY_UNIT[unit]

  function commit(raw: string) {
    setDraft(null)
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== quantity) onChange(round3(parsed))
  }

  return (
    <div className="flex items-center gap-1">
      <button
        aria-label={`Ubrat ${unit}`}
        onClick={() => onChange(Math.max(0, round3(quantity - step)))}
        className="rounded-lg border border-input p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
        disabled={quantity <= 0}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        aria-label={`Množství (${unit})`}
        type="number"
        min="0"
        step="any"
        value={draft ?? quantity}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
        className="w-14 rounded-lg border border-input bg-background px-1 py-1 text-center text-xs"
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
      <button
        aria-label={`Přidat ${unit}`}
        onClick={() => onChange(round3(quantity + step))}
        className="rounded-lg border border-input p-1 text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** Household stock ("zásoby") — what the household believes it currently has at home, restocked
 *  automatically by completePurchaseAction/importReceiptAction and periodically re-checked by the
 *  pantry-checkin cron (lib/pantry.ts). Deliberately not one long list: the storage locations are
 *  the primary navigation (a folder tile each, with icon, name, item count and warnings), and only
 *  the opened location's items are shown below — like a file manager for the home.
 *
 *  A row whose askedAt is set is one the cron just asked the household about, so it's highlighted
 *  until the household confirms ("Ještě mám") or removes it ("Došlo"). The location select on each
 *  row moves the item between *any* of the locations (e.g. chilled meat into the freezer). The
 *  quantity stepper lets them correct current stock directly without ever touching purchase
 *  history. "Zkontrolovat" opens the bulk check (components/shopping/pantry-review.tsx): tap only
 *  what ran out, save once, and everything else is confirmed. */
export function Pantry({
  items,
  onConfirm,
  onRemove,
  onMove,
  onAdjustQuantity,
  onReview,
  onSetTracking,
  estimates,
  openCheck = false,
  onCheckOpened,
}: {
  items: PantryItem[]
  onConfirm: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, location: PantryLocation) => void
  onAdjustQuantity: (id: string, quantity: number) => void
  /** Saves a bulk check; resolves to what was done, rejects when nothing was saved. */
  onReview: (reviewedIds: string[], goneIds: string[], addGoneToList: boolean) => Promise<PantryReviewResult>
  /** How closely an item is watched: normal, rarely (salt, spices), not at all. */
  onSetTracking: (id: string, tracking: PantryTracking) => void
  /** "Asi došlo" estimates by pantry item id (lib/pantry-estimate.ts). */
  estimates: Map<string, ConsumptionEstimate>
  /** Open the check of uncertain items right away (the weekly notification's link). */
  openCheck?: boolean
  onCheckOpened?: () => void
}) {
  const likelyGone = useMemo(() => new Set([...estimates].filter(([, estimate]) => estimate.likelyGone).map(([id]) => id)), [estimates])
  const summary = summarizeByLocation(items, likelyGone)
  // Open on the first location that has something in it rather than on an empty folder.
  const [selected, setSelected] = useState<PantryLocation>(() => PANTRY_LOCATIONS.find((location) => summary[location].count > 0) ?? PANTRY_LOCATIONS[0])
  // Announces a move: the moved row leaves the open folder, so without this it would just vanish.
  const [notice, setNotice] = useState<string | null>(null)
  // The check opened from the "K ověření" banner covers every location (the asked items can be
  // anywhere); opened from a folder, it starts with that folder.
  const toCheck = items.filter((item) => needsCheck(item, likelyGone)).length
  const [reviewing, setReviewing] = useState<'location' | 'uncertain' | 'all' | null>(() => (openCheck ? (toCheck > 0 ? 'uncertain' : 'all') : null))
  // The link that opened the check is consumed once, so a reload or a later visit does not reopen it.
  useEffect(() => {
    if (openCheck) onCheckOpened?.()
  }, [openCheck, onCheckOpened])

  const SelectedIcon = LOCATION_ICON[selected]
  const selectedItems = items.filter((item) => item.location === selected)

  function move(item: PantryItem, location: PantryLocation) {
    onMove(item.id, location)
    setNotice(`Přesunuto: ${item.name} → ${location}`)
  }

  function closeReview(result: PantryReviewResult | null) {
    setReviewing(null)
    if (!result) return
    const parts = [`došlo ${itemCountLabel(result.removed)}`, `potvrzeno ${itemCountLabel(result.confirmed)}`]
    if (result.addedToList > 0) parts.push(`na seznam ${itemCountLabel(result.addedToList)}`)
    setNotice(`Kontrola uložena: ${parts.join(', ')}.${result.listFailed ? ' Některé položky se nepodařilo přidat na nákupní seznam — přidejte je prosím ručně.' : ''}`)
  }

  return (
    <div className="space-y-4">
      {toCheck > 0 && !reviewing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
          <p className="min-w-0 text-sm">
            Máte je ještě? K ověření: <span className="font-semibold">{itemCountLabel(toCheck)}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setReviewing('uncertain')
              setNotice(null)
            }}
            className="min-h-9 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Zkontrolovat
          </button>
        </div>
      )}
      <nav aria-label="Umístění zásob" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PANTRY_LOCATIONS.map((location) => {
          const Icon = LOCATION_ICON[location]
          const { count, needsCheck, outOfStock } = summary[location]
          const active = location === selected
          return (
            <button
              key={location}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelected(location)
                setNotice(null)
              }}
              className={cn(
                'flex min-w-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card hover:bg-muted',
              )}
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary-foreground/15' : 'bg-secondary text-secondary-foreground')}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 break-words text-sm font-semibold leading-tight">{location}</span>
              <span className={cn('text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{itemCountLabel(count)}</span>
              {(needsCheck > 0 || outOfStock > 0) && (
                <span className="flex flex-wrap gap-1">
                  {needsCheck > 0 && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/15 text-primary')}>
                      Ověřit: {needsCheck}
                    </span>
                  )}
                  {outOfStock > 0 && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive/10 text-destructive')}>
                      Došlo: {outOfStock}
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {reviewing ? (
        <PantryReview items={items} location={selected} initialScope={reviewing} estimates={estimates} onSave={onReview} onClose={closeReview} />
      ) : (
      <section aria-label={`Zásoby: ${selected}`} className="overflow-hidden surface">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <SelectedIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <h2 className="min-w-0 break-words text-sm font-semibold">{selected}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">{itemCountLabel(selectedItems.length)}</span>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setReviewing('location')
                  setNotice(null)
                }}
                className="flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-medium hover:bg-muted"
              >
                <ClipboardCheck className="h-3.5 w-3.5" aria-hidden /> Zkontrolovat
              </button>
            )}
          </div>
        </div>

        <p role="status" aria-live="polite" className={notice ? 'border-b border-border bg-primary/10 px-5 py-2 text-xs text-primary' : 'sr-only'}>
          {notice ?? ''}
        </p>

        {selectedItems.length === 0 && (
          <div className="p-10 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-semibold">{items.length === 0 ? 'Zásoby jsou prázdné' : `V umístění „${selected}“ zatím nic není`}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length === 0
                ? 'Položky se sem přidají automaticky po dokončení nákupu.'
                : 'Položky se sem přidají po dokončení nákupu nebo je sem přesunete z jiného umístění.'}
            </p>
          </div>
        )}

        {selectedItems.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 last:border-0">
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <span className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-words font-medium">{item.name}</span>
                {likelyGone.has(item.id) ? (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    Asi došlo
                  </span>
                ) : (
                  item.askedAt && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Máte ještě?</span>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {item.category}
                {likelyGone.has(item.id) && ` · ${estimateReason(estimates.get(item.id)!)}`}
              </span>
            </div>
            <QuantityStepper quantity={item.quantity} unit={item.unit} onChange={(quantity) => onAdjustQuantity(item.id, quantity)} />
            <select
              aria-label={`Umístění ${item.name}`}
              value={item.location}
              onChange={(event) => move(item, event.target.value as PantryLocation)}
              className="max-w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none"
            >
              {PANTRY_LOCATIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            {/* Salt, spices or oil need no weekly question: "Jen zřídka" asks every few months,
                "Nesledovat" never, and neither is ever estimated as used up. */}
            <select
              aria-label={`Sledování ${item.name}`}
              value={item.tracking ?? 'normal'}
              onChange={(event) => onSetTracking(item.id, event.target.value as PantryTracking)}
              className="max-w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none"
            >
              {PANTRY_TRACKING.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {/* Grouped so the two icon buttons wrap onto a new line together on a narrow phone, not one by one. */}
            <div className="flex items-center">
              <button
                aria-label={`Ještě mám: ${item.name}`}
                onClick={() => onConfirm(item.id)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                aria-label={`Došlo: ${item.name}`}
                onClick={() => onRemove(item.id)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </section>
      )}
    </div>
  )
}
