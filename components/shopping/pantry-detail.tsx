'use client'

import { Check, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { ProductVisual } from '@/components/ui/product-visual'
import { Sheet } from '@/components/ui/sheet'
import { formatPantryQuantity, PANTRY_TRACKING, roundPantryQuantity, type PantryPlaceOption } from '@/lib/pantry'
import { PRODUCT_SUBCATEGORIES, subcategoriesOfItem } from '@/lib/product-subcategories'
import { productVisualFor } from '@/lib/product-visuals'
import type { ItemCategory, PantryItem, PantryTracking } from '@/lib/types'

const ITEM_CATEGORY_NAMES = Object.keys(PRODUCT_SUBCATEGORIES) as ItemCategory[]

/** The detail of one pantry item: its picture, how much is at home, where it is kept and what the
 *  household decided about it.
 *
 *  It is the same sheet the rest of the app uses (a bottom sheet on a phone, a dialog on a
 *  desktop) — accessible by keyboard, closed with Escape. Everything it can change, it changes
 *  through the callbacks the pantry page already had, so the saving and the synchronisation stay
 *  the ones the app has always used. */
export function PantryDetail({
  item,
  placeOptions,
  estimate,
  onClose,
  onAdjustQuantity,
  onMove,
  onSetTracking,
  onSetCategory,
  onSetSubcategory,
  onConfirm,
  onRemove,
}: {
  item: PantryItem
  /** Every place the household may keep the item in. */
  placeOptions: PantryPlaceOption[]
  /** Why the app thinks the item has probably run out ("Asi došlo"), when it says so. */
  estimate?: string
  onClose: () => void
  /** Saves an exact amount; resolves to whether the amount was saved. */
  onAdjustQuantity: (quantity: number) => Promise<boolean>
  onMove: (placeKey: string) => void
  onSetTracking: (tracking: PantryTracking) => void
  onSetCategory: (category: ItemCategory) => void
  onSetSubcategory: (subcategory: string | null) => void
  /** "Ještě mám" — the household confirms the item is still there. */
  onConfirm: () => void
  /** "Odstranit" — the record is gone for good. The availability toggle in the cell is not this. */
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(() => String(item.quantity))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const visual = productVisualFor({
    productTypeKey: item.productTypeKey,
    subcategory: item.subcategory,
    category: item.category,
    imageUrl: item.imageRef ? `/api/product-types/images/${item.productTypeKey}` : null,
  })

  // The amount follows the item whenever it changes elsewhere (the cell's +/−, a fresh copy from
  // the server); a half-typed number the household is writing keeps its own text.
  useEffect(() => {
    setDraft(String(item.quantity))
  }, [item.quantity])

  async function save() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Množství musí být číslo od nuly do dané.')
      return
    }
    setSaving(true)
    setError(null)
    const saved = await onAdjustQuantity(roundPantryQuantity(parsed))
    setSaving(false)
    // A failed save keeps the sheet open, so the change can be tried again instead of lost.
    if (saved) onClose()
    else setError('Množství se nepodařilo uložit. Zkuste to prosím znovu.')
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description={`${item.category}${item.subcategory ? ` ▸ ${item.subcategory}` : ''}`}
      initialFocus={amountRef}
      footer={
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Ukládám…' : 'Uložit'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-muted/50">
            <ProductVisual visual={visual} className="size-full" />
          </span>
          <p className="min-w-0 text-sm text-fg-secondary">
            <span className="block font-semibold text-foreground">{formatPantryQuantity(item.quantity)} {item.unit}</span>
            {item.unitQuantity != null && item.unitUnit && !(item.unitQuantity === 1 && item.unitUnit === 'ks') && (
              <span className="block text-xs text-fg-muted">jedno balení: {formatPantryQuantity(item.unitQuantity)} {item.unitUnit}</span>
            )}
            {item.tracking === 'rare' && <span className="block text-xs text-fg-muted">sledováno zřídka</span>}
            {item.tracking === 'off' && <span className="block text-xs text-fg-muted">nesledováno</span>}
            {estimate && <span className="block text-xs text-fg-muted">asi došlo: {estimate}</span>}
          </p>
        </div>

        <label className="block space-y-1.5 text-sm font-medium">
          <span>Množství ({item.unit})</span>
          <input
            ref={amountRef}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter ends the typing, it does not save: saving is the explicit "Uložit", so a
              // half-typed number can never be written to the pantry by accident.
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </label>

        <label className="block space-y-1.5 text-sm font-medium">
          <span>Umístění</span>
          <Select aria-label="Umístění" value={item.customPlaceId ? `custom:${item.customPlaceId}` : item.location} onChange={(event) => onMove(event.target.value)}>
            {placeOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-1.5 text-sm font-medium">
          <span>Kategorie</span>
          <Select aria-label="Kategorie" value={item.category} onChange={(event) => onSetCategory(event.target.value as ItemCategory)}>
            {ITEM_CATEGORY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </label>

        {subcategoriesOfItem(item.category).length > 0 && (
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Podkategorie</span>
            <Select aria-label="Podkategorie" value={item.subcategory ?? ''} onChange={(event) => onSetSubcategory(event.target.value || null)}>
              <option value="">Nezařazeno</option>
              {subcategoriesOfItem(item.category).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
        )}

        {/* Salt, spices or oil need no weekly question: "Jen zřídka" asks every few months,
            "Nesledovat" never, and neither is ever estimated as used up. */}
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Sledování</span>
          <Select aria-label="Sledování" value={item.tracking ?? 'normal'} onChange={(event) => onSetTracking(event.target.value as PantryTracking)}>
            {PANTRY_TRACKING.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-destructive-subtle px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onConfirm}>
            <Check aria-hidden /> Ještě mám
          </Button>
          <Button type="button" variant="outline" onClick={onRemove} className="text-destructive">
            <Trash2 aria-hidden /> Odstranit
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
