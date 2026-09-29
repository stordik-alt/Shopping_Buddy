import { useState } from 'react'
import { CHECKIN_DAYS_BY_CATEGORY } from '@/lib/pantry'
import { userFacingError } from '@/lib/errors'
import type { ItemCategory } from '@/lib/types'

const CATEGORIES = Object.keys(CHECKIN_DAYS_BY_CATEGORY) as ItemCategory[]

/** Profil domácnosti → Zásoby: how many days a category can go unconfirmed before the weekly
 *  check-in asks about it (spec section 13) — a household's own override of
 *  `lib/pantry.ts`'s fixed `CHECKIN_DAYS_BY_CATEGORY` defaults, shown as that default's value
 *  until the household sets its own. */
export function PantryCheckinSettings({
  overrides,
  onSave,
}: {
  overrides: Partial<Record<ItemCategory, number>>
  onSave: (category: ItemCategory, days: number | null) => Promise<Partial<Record<ItemCategory, number>>>
}) {
  const [drafts, setDrafts] = useState<Partial<Record<ItemCategory, string>>>({})
  const [saving, setSaving] = useState<ItemCategory | null>(null)
  const [error, setError] = useState('')

  async function commit(category: ItemCategory, raw: string) {
    setDrafts((current) => ({ ...current, [category]: undefined }))
    const trimmed = raw.trim()
    const isDefault = trimmed === '' || Number(trimmed) === CHECKIN_DAYS_BY_CATEGORY[category]
    const current = overrides[category] ?? CHECKIN_DAYS_BY_CATEGORY[category]
    const next = isDefault ? null : Number(trimmed)
    if ((isDefault && overrides[category] == null) || next === current) return
    setSaving(category)
    setError('')
    try {
      await onSave(category, next)
    } catch (err) {
      setError(userFacingError(err, 'Nastavení se nepodařilo uložit.'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="surface p-6">
      <p className="font-semibold">Zásoby — kontrola podle kategorie</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Za kolik dní se má domácnost zeptat „Máte ještě?", pokud položku nikdo nepotvrdí. Prázdné pole = výchozí hodnota.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-2">
        {CATEGORIES.map((category) => {
          const value = drafts[category] ?? String(overrides[category] ?? CHECKIN_DAYS_BY_CATEGORY[category])
          const isOverridden = overrides[category] != null
          return (
            <div key={category} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
              <span className="min-w-0 break-words text-sm">
                {category}
                {isOverridden && <span className="ml-1.5 text-xs text-muted-foreground">(vlastní)</span>}
              </span>
              <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  aria-label={`Počet dní pro ${category}`}
                  type="number"
                  min={1}
                  max={365}
                  value={value}
                  disabled={saving === category}
                  onChange={(event) => setDrafts((current) => ({ ...current, [category]: event.target.value }))}
                  onBlur={(event) => commit(category, event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && commit(category, event.currentTarget.value)}
                  className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm outline-none disabled:opacity-60"
                />
                dní
              </label>
            </div>
          )
        })}
      </div>
    </section>
  )
}
