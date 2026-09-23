import { Check, Minus, Package, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { ItemUnit, PantryItem, PantryLocation } from '@/lib/types'

const LOCATIONS: PantryLocation[] = ['Spíž', 'Lednice', 'Mrazák', 'Domácnost', 'Lékárnička', 'Drogérka']

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

/** Household pantry ("spíž") — what the household believes it currently has at home, grouped by
 *  where it's physically kept, restocked automatically by completePurchaseAction/
 *  importReceiptAction and periodically re-checked by the pantry-checkin cron (lib/pantry.ts). A
 *  row whose askedAt is set is one the cron just asked the household about, so it's highlighted
 *  here until the household confirms ("Ještě mám") or removes it ("Došlo"). The location select
 *  lets the household reassign an item by hand — e.g. moving freshly bought chilled meat into the
 *  freezer for later use. The quantity stepper lets them correct current stock directly (e.g. after
 *  using some up) without that ever touching purchase history. */
export function Pantry({
  items,
  onConfirm,
  onRemove,
  onMove,
  onAdjustQuantity,
}: {
  items: PantryItem[]
  onConfirm: (id: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, location: PantryLocation) => void
  onAdjustQuantity: (id: string, quantity: number) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
        <Package className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 font-semibold">Spíž je prázdná</p>
        <p className="mt-1 text-sm text-muted-foreground">Položky se sem přidají automaticky po dokončení nákupu.</p>
      </div>
    )
  }

  const groups = LOCATIONS.map((location) => ({ location, items: items.filter((item) => item.location === location) })).filter((group) => group.items.length > 0)

  return (
    <div className="space-y-4">
      {groups.map(({ location, items: groupItems }) => (
        <div key={location} className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{location}</span>
            </div>
            <span className="text-xs text-muted-foreground">{groupItems.length} položek</span>
          </div>
          {groupItems.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 last:border-0">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  {item.askedAt && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Máte ještě?</span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.category}</span>
              </div>
              <QuantityStepper quantity={item.quantity} unit={item.unit} onChange={(quantity) => onAdjustQuantity(item.id, quantity)} />
              <select
                aria-label={`Umístění ${item.name}`}
                value={item.location}
                onChange={(event) => onMove(item.id, event.target.value as PantryLocation)}
                className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs outline-none"
              >
                {LOCATIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
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
          ))}
        </div>
      ))}
    </div>
  )
}
