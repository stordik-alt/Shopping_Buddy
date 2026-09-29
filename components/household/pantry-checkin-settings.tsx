import { useState } from 'react'
import { CHECKIN_DAYS_BY_CATEGORY, CHECKIN_DAYS_BY_SUBCATEGORY, checkinSubcategoryKey } from '@/lib/pantry'
import { subcategoriesOfItem } from '@/lib/product-subcategories'
import { userFacingError } from '@/lib/errors'
import type { ItemCategory } from '@/lib/types'

const CATEGORIES = Object.keys(CHECKIN_DAYS_BY_CATEGORY) as ItemCategory[]

type Row = {
  key: string
  label: string
  ariaLabel: string
  defaultDays: number
  overrideDays: number | undefined
  save: (days: number | null) => Promise<unknown>
}

/** Profil domácnosti → Zásoby: how many days an item can go unconfirmed before the weekly check-in
 *  asks about it (spec section 13). Shelf life differs a lot inside a category — bread, meat and tinned
 *  food are all Potraviny — so a category with built-in subcategory defaults
 *  (`CHECKIN_DAYS_BY_SUBCATEGORY`) is set per subcategory; the "Bez podkategorie" row is the value for
 *  items the categorization could not place. The other categories stay one row each. Every value is
 *  shown as its default until the household sets its own. */
export function PantryCheckinSettings({
  overrides,
  onSave,
  subcategoryOverrides,
  onSaveSubcategory,
}: {
  overrides: Partial<Record<ItemCategory, number>>
  onSave: (category: ItemCategory, days: number | null) => Promise<Partial<Record<ItemCategory, number>>>
  subcategoryOverrides: Record<string, number>
  onSaveSubcategory: (category: ItemCategory, subcategory: string, days: number | null) => Promise<Record<string, number>>
}) {
  const [drafts, setDrafts] = useState<Record<string, string | undefined>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const groups = CATEGORIES.map((category) => {
    const defaults = CHECKIN_DAYS_BY_SUBCATEGORY[category]
    const categoryRow: Row = {
      key: category,
      label: defaults ? 'Bez podkategorie' : category,
      ariaLabel: `Počet dní pro ${category}`,
      defaultDays: CHECKIN_DAYS_BY_CATEGORY[category],
      overrideDays: overrides[category],
      save: (days) => onSave(category, days),
    }
    // Follows the fixed subcategory order (lib/product-subcategories.ts) rather than the defaults'.
    const subcategoryRows: Row[] = defaults
      ? subcategoriesOfItem(category)
          .filter((subcategory) => defaults[subcategory] != null)
          .map((subcategory) => ({
            key: checkinSubcategoryKey(category, subcategory),
            label: subcategory,
            ariaLabel: `Počet dní pro ${category} – ${subcategory}`,
            defaultDays: defaults[subcategory],
            overrideDays: subcategoryOverrides[checkinSubcategoryKey(category, subcategory)],
            save: (days: number | null) => onSaveSubcategory(category, subcategory, days),
          }))
      : []
    return { category, subcategoryRows, categoryRow }
  })

  async function commit(row: Row, raw: string) {
    setDrafts((current) => ({ ...current, [row.key]: undefined }))
    const trimmed = raw.trim()
    const isDefault = trimmed === '' || Number(trimmed) === row.defaultDays
    const current = row.overrideDays ?? row.defaultDays
    const next = isDefault ? null : Number(trimmed)
    if ((isDefault && row.overrideDays == null) || next === current) return
    setSaving(row.key)
    setError('')
    try {
      await row.save(next)
    } catch (err) {
      setError(userFacingError(err, 'Nastavení se nepodařilo uložit.'))
    } finally {
      setSaving(null)
    }
  }

  function renderRow(row: Row) {
    const value = drafts[row.key] ?? String(row.overrideDays ?? row.defaultDays)
    return (
      <div key={row.key} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
        <span className="min-w-0 break-words text-sm">
          {row.label}
          {row.overrideDays != null && <span className="ml-1.5 text-xs text-muted-foreground">(vlastní)</span>}
        </span>
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <input
            aria-label={row.ariaLabel}
            type="number"
            min={1}
            max={365}
            value={value}
            disabled={saving === row.key}
            onChange={(event) => setDrafts((current) => ({ ...current, [row.key]: event.target.value }))}
            onBlur={(event) => commit(row, event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && commit(row, event.currentTarget.value)}
            className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm outline-none disabled:opacity-60"
          />
          dní
        </label>
      </div>
    )
  }

  return (
    <section className="surface p-6">
      <p className="font-semibold">Zásoby — kontrola podle kategorie</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Za kolik dní se má domácnost zeptat „Máte ještě?", pokud položku nikdo nepotvrdí. U potravin se doba liší podle podkategorie. Prázdné pole = výchozí hodnota.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-4">
        {groups.map(({ category, subcategoryRows, categoryRow }) =>
          subcategoryRows.length === 0 ? (
            renderRow(categoryRow)
          ) : (
            <div key={category} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
              {subcategoryRows.map(renderRow)}
              {renderRow(categoryRow)}
            </div>
          ),
        )}
      </div>
    </section>
  )
}
