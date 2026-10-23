'use client'

import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { ProductVisual } from '@/components/ui/product-visual'
import { formatPantryQuantity, isPantryItemAvailable, PANTRY_QUANTITY_STEP, restoredPantryQuantity, roundPantryQuantity } from '@/lib/pantry'
import { productVisualFor } from '@/lib/product-visuals'
import { unitLabel } from '@/lib/units'
import type { PantryItem } from '@/lib/types'
import { cn } from '@/lib/utils'

/** One product cell of the Zásoby grid: the product's picture, its name, how much of it is at
 *  home, the −/+ controls and whether the household still has it.
 *
 *  The picture comes from the shared product taxonomy (lib/product-visuals.ts) — the product type
 *  first, its subcategory or category when the type is unknown, and a neutral basket when nothing
 *  is known. A product type's R2 photograph takes priority when available; the illustration is
 *  the fallback while its image is still unfilled.
 *
 *  The amount and the availability are changed right here, without opening the detail. Both go
 *  through the same callback the detail uses, so they are saved and synchronized the same way. */
export function PantryCard({
  item,
  statuses,
  onAdjustQuantity,
  onOpen,
}: {
  item: PantryItem
  /** The household's own notes about the item ("Máte ještě?", "Asi došlo", "Dokoupit"). */
  statuses?: { label: string; tone: 'accent' | 'warning' }[]
  onAdjustQuantity: (id: string, quantity: number) => void
  onOpen: (item: PantryItem) => void
}) {
  const unit = item.unit
  const step = PANTRY_QUANTITY_STEP[unit]
  const available = isPantryItemAvailable(item.quantity)
  const visual = productVisualFor({ productTypeKey: item.productTypeKey, subcategory: item.subcategory, category: item.category })
  // The size of one piece, when the household bought a packaged product ("3 ks · 1,5 l"). A single
  // piece is left out — "3 ks · 1 ks" says nothing.
  const packaging = item.unitQuantity != null && item.unitUnit && !(item.unitQuantity === 1 && item.unitUnit === 'ks') ? `· ${formatPantryQuantity(item.unitQuantity)} ${item.unitUnit}` : null

  // The amount the household asked for last. A burst of taps must not be lost: the next amount is
  // counted from this value, not from the one that happened to be on screen when the click landed.
  // A failed save puts the old amount back, and the prop change resets this value with it.
  const requested = useRef(item.quantity)
  useEffect(() => {
    requested.current = item.quantity
  }, [item.quantity])

  function change(next: number) {
    const value = Math.max(0, roundPantryQuantity(next))
    requested.current = value
    onAdjustQuantity(item.id, value)
  }

  return (
    <div
      data-testid="pantry-card"
      className={cn(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-border p-2 text-center transition-colors',
        available ? 'bg-card shadow-[var(--shadow-card)]' : 'bg-muted/40',
      )}
    >
      {/* The picture and the name open the detail. One button, so the whole area is one tap target
          and a keyboard user reaches it in one step. */}
      <button
        type="button"
        aria-label={`Otevřít detail: ${item.name}`}
        onClick={() => onOpen(item)}
        className="flex w-full min-w-0 flex-col items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('flex size-18 items-center justify-center', !available && 'opacity-55 saturate-50')}>
          <ProductVisual
            visual={visual}
            imageUrl={item.imageRef && item.productTypeKey ? `/api/product-types/images/${encodeURIComponent(item.productTypeKey)}` : null}
            className="size-full"
          />
        </span>
        <span className="line-clamp-2 min-h-9 w-full break-words text-sm font-medium leading-tight">{item.name}</span>
      </button>

      {/* A reserved line, so every cell in the grid is the same height whether or not the item
          carries a note. */}
      <span className="flex h-5 items-center justify-center gap-1 overflow-hidden">
        {statuses?.map((status) => (
          <Badge key={status.label} tone={status.tone} className="truncate px-2 py-0 text-[10px]">
            {status.label}
          </Badge>
        ))}
      </span>

      {(item.contents?.length ?? 0) > 0 ? (
        <button type="button" onClick={() => onOpen(item)} className="min-h-10 w-full rounded-xl border border-input text-sm font-medium text-fg-secondary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Upravit produkty
        </button>
      ) : (
      <div className="flex w-full items-center justify-center gap-1">
        <button
          type="button"
          aria-label={`Ubrat ${unit} (${item.name})`}
          onClick={() => change(requested.current - step)}
          disabled={item.quantity <= 0}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-input text-fg-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <span className="flex min-w-0 flex-1 flex-col items-center leading-tight">
          <span data-testid="pantry-quantity" className="text-lg font-semibold tabular-nums">
            {formatPantryQuantity(item.quantity)}
          </span>
          <span className="text-[11px] text-fg-muted">{unitLabel(item.quantity, unit)}</span>
        </span>
        <button
          type="button"
          aria-label={`Přidat ${unit} (${item.name})`}
          onClick={() => change(requested.current + step)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-input text-fg-secondary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      )}

      <span className="flex h-4 items-center justify-center text-[11px] text-fg-muted">{packaging}</span>

      {/* The availability is written out, not only coloured: "Mám" / "Nemám". Marking the item as
          gone sets the amount to zero and keeps the record — the history of what the household had
          stays. Marking it as available again restores one step of the item's own unit. */}
      <button
        type="button"
        aria-label={`Dostupnost: ${item.name}`}
        onClick={() => change(available ? 0 : restoredPantryQuantity(unit))}
        className={cn(
          'w-full rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          available ? 'bg-success-subtle text-success hover:bg-success-subtle/70' : 'bg-muted text-fg-secondary hover:bg-muted/70',
        )}
      >
        {available ? 'Mám' : 'Nemám'}
      </button>
    </div>
  )
}
