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
import { PRODUCT_TYPES } from '@/lib/product-types'
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
  onSetProductType,
  onAdjustContent,
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
  onSetProductType: (productTypeKey: string | null) => Promise<void>
  onAdjustContent: (contentId: string, quantity: number, expectedQuantity: number) => Promise<boolean>
  /** "Ještě mám" — the household confirms the item is still there. */
  onConfirm: () => void
  /** "Odstranit" — the record is gone for good. The availability toggle in the cell is not this. */
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(() => String(item.quantity))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contentDrafts, setContentDrafts] = useState<Record<string, string>>(() => Object.fromEntries((item.contents ?? []).map((content) => [content.id, String(content.quantity)])))
  const amountRef = useRef<HTMLInputElement>(null)
  const visual = productVisualFor({ productTypeKey: item.productTypeKey, subcategory: item.subcategory, category: item.category })

  // The amount follows the item whenever it changes elsewhere (the cell's +/−, a fresh copy from
  // the server); a half-typed number the household is writing keeps its own text.
  useEffect(() => {
    setDraft(String(item.quantity))
  }, [item.quantity])

  useEffect(() => {
    setContentDrafts(Object.fromEntries((item.contents ?? []).map((content) => [content.id, String(content.quantity)])))
  }, [item.contents])

  async function saveContent(contentId: string, currentQuantity: number) {
    const parsed = Number(contentDrafts[contentId])
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Množství musí být číslo od nuly do dané.')
      return
    }
    if (parsed === currentQuantity) return
    setError(null)
    try {
      if (!(await onAdjustContent(contentId, parsed, currentQuantity))) setError('Množství produktu se nepodařilo uložit. Obnovte zásoby a zkuste to znovu.')
    } catch {
      setError('Množství produktu se nepodařilo uložit. Obnovte zásoby a zkuste to znovu.')
    }
  }

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
        <Button type="button" onClick={() => item.contents?.length ? onClose() : void save()} disabled={saving}>
          {saving ? 'Ukládám…' : item.contents?.length ? 'Hotovo' : 'Uložit'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-muted/50">
            <ProductVisual
              visual={visual}
              imageUrl={item.imageRef && item.productTypeKey ? `/api/product-types/images/${encodeURIComponent(item.productTypeKey)}` : null}
              className="size-full"
            />
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

        {(item.contents?.length ?? 0) > 0 ? (
          <section className="space-y-2" aria-label="Produkty v zásobě">
            <div>
              <h3 className="text-sm font-medium">Konkrétní produkty</h3>
              <p className="text-sm text-fg-muted">Celkem {formatPantryQuantity(item.quantity)} {item.unit}; změny množství se ukládají u jednotlivých produktů.</p>
            </div>
            <ul className="space-y-2">
              {item.contents!.map((content) => (
                <li key={content.id} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 rounded-xl border border-border p-2.5">
                  <span className="min-w-0 break-words text-sm font-medium">{content.name}</span>
                  <input
                    aria-label={`Množství produktu ${content.name}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={contentDrafts[content.id] ?? String(content.quantity)}
                    onChange={(event) => setContentDrafts((current) => ({ ...current, [content.id]: event.target.value }))}
                    onBlur={() => void saveContent(content.id, content.quantity)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        event.currentTarget.blur()
                      }
                    }}
                    className="h-10 w-full rounded-xl border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span className="text-sm text-fg-muted">{content.unit}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
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
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
        )}
        {item.productTypeId && !item.productId && (item.contents?.length ?? 0) === 0 && (
          <p className="text-sm text-fg-muted">Starší zásoba je uložená jen souhrnně, bez názvů konkrétních produktů. Změna druhu se proto použije na tuto zásobu; konkrétní produkty a jejich množství se začnou evidovat z dalších účtenek.</p>
        )}

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

        <label className="block space-y-1.5 text-sm font-medium">
          <span>Druh produktu</span>
          <Select aria-label="Druh produktu" value={item.productTypeKey ?? ''} onChange={(event) => void onSetProductType(event.target.value || null)}>
            <option value="">Neurčeno</option>
            {[...PRODUCT_TYPES].sort((a, b) => a.name.localeCompare(b.name, 'cs')).map((type) => (
              <option key={type.key} value={type.key}>{type.name}</option>
            ))}
          </Select>
        </label>

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
