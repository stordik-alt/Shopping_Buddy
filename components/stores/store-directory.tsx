import { useState } from 'react'
import { ChevronDown, Clock, Loader2, LocateFixed, MapPin, Navigation, Search, Tag, X } from 'lucide-react'
import { activeDealCountLabel, storeCountLabel } from '@/lib/format'
import { distanceKm, type GpsCoords } from '@/lib/geo'
import type { LocationState } from '@/lib/use-user-location'
import type { Store } from '@/lib/types'

// The directory holds every seeded branch in the country (hundreds). Rendering them all made the
// page over 10 000 px tall on a phone, so they are shown in pages of this size.
const PAGE_SIZE = 24

export function StoreDirectory({
  stores,
  locationState,
  userCoords,
  onRequestLocation,
  onClearLocation,
}: {
  stores: Store[]
  locationState: LocationState
  userCoords: GpsCoords | null
  onRequestLocation: () => void
  onClearLocation: () => void
}) {
  // Empty by default: with stores now nationwide, defaulting to any one city would hide most of
  // them. Empty means "show everywhere"; typing a city narrows it (or granting GPS sorts by distance).
  const [location, setLocation] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const usingGps = locationState === 'granted' && userCoords != null

  const storesWithDistance = stores
    .map((store) => ({ ...store, distanceKm: userCoords && store.gps ? distanceKm(userCoords, store.gps) : null }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))

  // While using GPS, real distance already does the "near me" job — the typed location text
  // (with no way to know what it resolves to without reverse-geocoding) shouldn't also filter.
  const visibleStores = storesWithDistance.filter(
    (store) =>
      (store.name.toLowerCase().includes(query.toLowerCase()) || store.chain.toLowerCase().includes(query.toLowerCase())) &&
      (usingGps || location.trim() === '' || store.address.toLowerCase().includes(location.trim().toLowerCase())),
  )
  const shownStores = visibleStores.slice(0, limit)

  // A new search starts again from the first page, so the "show more" count stays meaningful.
  const onLocationChange = (value: string) => {
    setLocation(value)
    setLimit(PAGE_SIZE)
  }
  const onQueryChange = (value: string) => {
    setQuery(value)
    setLimit(PAGE_SIZE)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Obchody ve vašem okolí · Česká republika</p>
        <h2 className="mt-1 text-2xl font-semibold">Kde nakoupit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Porovnejte vzdálenost, otevírací dobu a akce.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {usingGps ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary focus-within:ring-2 focus-within:ring-ring">
            <LocateFixed className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Řadíme podle vaší aktuální polohy</span>
            <button onClick={onClearLocation} className="shrink-0 whitespace-nowrap text-xs font-medium underline hover:no-underline">
              Zadat ručně
            </button>
          </div>
        ) : (
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="sr-only">Lokalita</span>
            <input
              value={location}
              onChange={(event) => onLocationChange(event.target.value)}
              placeholder="Město, např. Brno"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
              aria-label="Lokalita"
            />
          </label>
        )}
        {!usingGps && (
          <button
            onClick={onRequestLocation}
            disabled={locationState === 'loading'}
            className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {locationState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-primary" />}
            Použít mou polohu
          </button>
        )}
        <label className="flex min-w-full flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:min-w-[12rem]">
          <Search className="h-4 w-4 shrink-0" />
          <span className="sr-only">Hledat obchod</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Hledat řetězec nebo prodejnu"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
            aria-label="Hledat obchod"
          />
        </label>
      </div>
      {locationState === 'denied' && (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          Poloha nebyla povolena, obchody zobrazujeme podle zadané lokality. Vzdálenost se používá pouze pro hledání obchodů v okolí a její
          použití můžete kdykoliv odmítnout.
        </p>
      )}
      {visibleStores.length > 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {visibleStores.length > shownStores.length
            ? `Zobrazeno ${shownStores.length} z ${storeCountLabel(visibleStores.length)}`
            : storeCountLabel(visibleStores.length)}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shownStores.map((store) => {
          const expanded = store.id === selected
          return (
            <li key={store.id} className="surface overflow-hidden">
              <button
                onClick={() => setSelected(expanded ? null : store.id)}
                aria-expanded={expanded}
                aria-controls={`store-detail-${store.id}`}
                className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/60"
              >
                {/* The chain's colour as a small badge instead of a full-width banner: a branch then
                    takes one compact row, and the colour still makes chains easy to tell apart. */}
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${store.color} text-xs font-bold text-neutral-900`} aria-hidden="true">
                  {store.chain.slice(0, 3)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold">{store.name}</span>
                  <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                    {store.distanceKm != null && <span className="font-medium text-foreground">{store.distanceKm.toFixed(1)} km · </span>}
                    {store.address}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" /> {store.hours ?? 'Otevírací doba neznámá'}
                    </span>
                    {store.dealsCount > 0 && (
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <Tag className="h-3 w-3 shrink-0" /> {activeDealCountLabel(store.dealsCount)} v řetězci
                      </span>
                    )}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {/* The detail opens under the tapped row. It used to render after the whole list, so on
                  a phone a tap seemed to do nothing — the detail was thousands of pixels further down. */}
              {expanded && (
                <div id={`store-detail-${store.id}`} className="border-t border-border bg-primary/5 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">Detail prodejny</p>
                    <button aria-label={`Zavřít detail obchodu ${store.name}`} onClick={() => setSelected(null)} className="icon-button -m-2">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {store.availableProducts.length > 0 ? (
                    <>
                      <p className="mt-2 text-xs text-muted-foreground">Produkty, u kterých tu známe cenu:</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {store.availableProducts.map((product) => (
                          <span key={product} className="rounded-full bg-card px-3 py-1.5 text-xs font-medium">
                            {product}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">U této prodejny zatím neznáme žádné ceny.</p>
                  )}
                  {store.gps && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${store.gps.lat},${store.gps.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Navigovat
                    </a>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {visibleStores.length > shownStores.length && (
        <button
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium text-primary hover:bg-muted"
        >
          Zobrazit další ({Math.min(PAGE_SIZE, visibleStores.length - shownStores.length)})
        </button>
      )}
      {visibleStores.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Žádný obchod neodpovídá hledání. Zkuste jiné město nebo název řetězce.
        </div>
      )}
      {/* Branch locations, addresses and opening hours come from OpenStreetMap (lib/stores/osm.ts);
          its licence (ODbL) requires this attribution wherever the data is shown. */}
      <p className="text-xs text-muted-foreground">
        Prodejny, adresy a otevírací doby:{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
          © přispěvatelé OpenStreetMap
        </a>
      </p>
    </div>
  )
}
