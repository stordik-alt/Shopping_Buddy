import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PANTRY_AREAS } from '@/lib/pantry'
import { userFacingError } from '@/lib/errors'
import type { PantryArea, PantryPlace } from '@/lib/types'

/** Profil domácnosti → Zásoby: the household's own storage places, beyond the fixed Spíž/Lednice/
 *  Mrazák/... list (spec section 12: "Uživatel musí mít možnost vytvořit vlastní místo") — e.g.
 *  "Kufr auta" under Auto, or "Sklep" under Bydlení. Adding/removing is a setting, so it lives here
 *  rather than in the Zásoby tab itself (CLAUDE.md section 12: "Profil domácnosti není místo pro
 *  běžné každodenní operace"). */
export function PantryPlaces({
  places,
  onAdd,
  onRemove,
}: {
  places: PantryPlace[]
  onAdd: (area: PantryArea, name: string) => Promise<PantryPlace>
  onRemove: (placeId: string) => Promise<void>
}) {
  const [area, setArea] = useState<PantryArea>('Auto')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const grouped = PANTRY_AREAS.map((groupArea) => ({ area: groupArea, places: places.filter((place) => place.area === groupArea) })).filter((group) => group.places.length > 0)

  async function add() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')
    try {
      await onAdd(area, trimmed)
      setName('')
    } catch (err) {
      setError(userFacingError(err, 'Místo se nepodařilo přidat.'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(placeId: string) {
    setRemovingId(placeId)
    setError('')
    try {
      await onRemove(placeId)
    } catch (err) {
      setError(userFacingError(err, 'Místo se nepodařilo odebrat.'))
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section className="surface p-6">
      <p className="font-semibold">Zásoby — vlastní místa</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Spíž, lednice a mrazák jsou vždy k dispozici. Přidejte si další místa, kde doma něco skladujete — např. kufr auta nebo sklep.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <select
          aria-label="Oblast nového místa"
          value={area}
          onChange={(event) => setArea(event.target.value as PantryArea)}
          className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none"
        >
          {PANTRY_AREAS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          aria-label="Název nového místa"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          placeholder="Např. Kufr auta"
          className="min-h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={saving || !name.trim()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden /> Přidat
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {grouped.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Zatím žádná vlastní místa.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {grouped.map((group) => (
            <div key={group.area}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.area}</p>
              <ul className="mt-2 space-y-1.5">
                {group.places.map((place) => (
                  <li key={place.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-sm">
                    <span className="min-w-0 break-words">{place.name}</span>
                    <button
                      type="button"
                      aria-label={`Odebrat místo ${place.name}`}
                      onClick={() => remove(place.id)}
                      disabled={removingId === place.id}
                      className="icon-button size-8 shrink-0 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
