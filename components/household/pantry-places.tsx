import { PackagePlus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CollapsibleSection } from '@/components/shared/collapsible-section'
import { ConfirmRemoveButton } from '@/components/shared/confirm-remove-button'
import { checkLocationRemoval, PANTRY_AREAS, PANTRY_LOCATIONS, pantryPlaceOptions } from '@/lib/pantry'
import { userFacingError } from '@/lib/errors'
import type { PantryArea, PantryItem, PantryLocation, PantryPlace } from '@/lib/types'
import { Input, Select } from '@/components/ui/field'

/** Profil domácnosti → Zásoby: the household's own storage places, beyond the fixed Spíž/Lednice/
 *  Mrazák/... list — which it can also remove and replace with its own (items kept there are moved
 *  to a place it picks first) (spec section 12: "Uživatel musí mít možnost vytvořit vlastní místo") — e.g.
 *  "Kufr auta" under Auto, or "Sklep" under Bydlení. Adding/removing is a setting, so it lives here
 *  rather than in the Zásoby tab itself (CLAUDE.md section 12: "Profil domácnosti není místo pro
 *  běžné každodenní operace"). */
export function PantryPlaces({
  places,
  hiddenLocations = [],
  items = [],
  onAdd,
  onRemove,
  onRemoveLocation,
  onRestoreLocation,
}: {
  places: PantryPlace[]
  /** Fixed locations the household removed. */
  hiddenLocations?: PantryLocation[]
  /** Pantry items, to count what a default location still holds before it is removed. */
  items?: Pick<PantryItem, 'location' | 'customPlaceId'>[]
  onAdd: (area: PantryArea, name: string) => Promise<PantryPlace>
  onRemove: (placeId: string) => Promise<void>
  onRemoveLocation?: (location: PantryLocation, targetKey?: string | null) => Promise<void>
  onRestoreLocation?: (location: PantryLocation) => Promise<void>
}) {
  const [area, setArea] = useState<PantryArea>('Auto')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // The default location being removed, and where its items go (only asked when it holds some).
  const [removingLocation, setRemovingLocation] = useState<PantryLocation | null>(null)
  const [targetKey, setTargetKey] = useState('')
  const [locationBusy, setLocationBusy] = useState(false)

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

  const targets = removingLocation
    ? pantryPlaceOptions(places, [...hiddenLocations, removingLocation]).filter((option) => option.key !== removingLocation)
    : []
  const heldCount = (location: PantryLocation) => items.filter((item) => !item.customPlaceId && item.location === location).length

  async function removeLocation(location: PantryLocation) {
    const check = checkLocationRemoval({ location, hiddenLocations, customPlaces: places, items, targetKey })
    if ('error' in check) {
      setError(check.error)
      return
    }
    setLocationBusy(true)
    setError('')
    try {
      await onRemoveLocation?.(location, targetKey || null)
      setRemovingLocation(null)
      setTargetKey('')
    } catch (err) {
      setError(userFacingError(err, 'Místo se nepodařilo odebrat.'))
    } finally {
      setLocationBusy(false)
    }
  }

  async function restoreLocation(location: PantryLocation) {
    setLocationBusy(true)
    setError('')
    try {
      await onRestoreLocation?.(location)
    } catch (err) {
      setError(userFacingError(err, 'Místo se nepodařilo obnovit.'))
    } finally {
      setLocationBusy(false)
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
    <CollapsibleSection title="Zásoby — vlastní místa" icon={<PackagePlus />} summary={places.length > 0 ? `Vlastních míst: ${places.length}` : 'Zatím žádná vlastní místa'}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Přidejte si další místa, kde doma něco skladujete — např. kufr auta nebo sklep. Výchozí místa můžete odebrat a nahradit vlastními.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Select
          aria-label="Oblast nového místa"
          value={area}
          onChange={(event) => setArea(event.target.value as PantryArea)}
          className="px-3"
        >
          {PANTRY_AREAS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Název nového místa"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          placeholder="Např. Kufr auta"
          className="px-3 flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={saving || !name.trim()}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden /> Přidat
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {onRemoveLocation && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Výchozí místa</p>
          <ul className="mt-2 space-y-1.5">
            {PANTRY_LOCATIONS.map((location) => {
              const hidden = hiddenLocations.includes(location)
              const held = heldCount(location)
              return (
                <li key={location} className="rounded-xl bg-muted px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className={hidden ? 'min-w-0 break-words text-muted-foreground line-through' : 'min-w-0 break-words'}>{location}</span>
                    {hidden ? (
                      <button type="button" disabled={locationBusy} onClick={() => void restoreLocation(location)} className="min-h-11 rounded-lg px-3 text-sm font-medium text-accent-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
                        Obnovit
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Odebrat místo ${location}`}
                        disabled={locationBusy}
                        onClick={() => {
                          setError('')
                          setTargetKey('')
                          setRemovingLocation(removingLocation === location ? null : location)
                        }}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  {removingLocation === location && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      {held > 0 ? (
                        <Select aria-label={`Kam přesunout položky z místa ${location}`} value={targetKey} onChange={(event) => setTargetKey(event.target.value)} className="px-3 sm:flex-1">
                          <option value="">Přesunout {held} položek do…</option>
                          {targets.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <p className="text-muted-foreground sm:flex-1">V tomto místě nejsou žádné položky.</p>
                      )}
                      <button
                        type="button"
                        disabled={locationBusy || (held > 0 && !targetKey)}
                        onClick={() => void removeLocation(location)}
                        className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-white hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      >
                        Odebrat místo
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
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
                    <ConfirmRemoveButton label={`místo ${place.name}`} onConfirm={() => void remove(place.id)} disabled={removingId === place.id}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </ConfirmRemoveButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
