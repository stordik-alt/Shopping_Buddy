import { useState } from 'react'
import { ArrowUpRight, Loader2, LocateFixed, MapPin, Search, Tag, X } from 'lucide-react'
import { distanceKm, type GpsCoords } from '@/lib/geo'
import type { LocationState } from '@/lib/use-user-location'
import type { Store } from '@/lib/types'

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
  const activeStore = storesWithDistance.find((store) => store.id === selected)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Obchody ve vašem okolí · Česká republika</p>
        <h2 className="mt-1 text-2xl font-semibold">Kde nakoupit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Porovnejte vzdálenost, otevírací dobu a akce.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {usingGps ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
            <LocateFixed className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Používá se vaše aktuální poloha (GPS)</span>
            <button onClick={onClearLocation} className="shrink-0 whitespace-nowrap text-xs font-medium underline hover:no-underline">
              Zadat ručně
            </button>
          </div>
        ) : (
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="sr-only">Lokalita</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Celá ČR · zadejte město pro zúžení"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
              aria-label="Lokalita"
            />
          </label>
        )}
        <button
          onClick={onRequestLocation}
          disabled={locationState === 'loading'}
          className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          {locationState === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-primary" />}
          Použít mou polohu
        </button>
        <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Search className="h-4 w-4 shrink-0" />
          <span className="sr-only">Hledat obchod</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hledat obchod"
            className="min-w-0 flex-1 bg-transparent outline-none"
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
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleStores.map((store) => (
          <button
            key={store.id}
            onClick={() => setSelected(store.id)}
            className="rounded-3xl border border-border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className={`flex h-16 items-center justify-between rounded-2xl ${store.color} px-4 text-2xl font-bold text-foreground`}>
              <span>{store.chain}</span>
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-semibold">{store.dealsCount} aktivních akcí</p>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{store.distanceKm != null ? `${store.distanceKm.toFixed(1)} km` : store.address}</span>
              <span>{store.hours ?? 'Otevírací doba není zatím známá'}</span>
            </div>
          </button>
        ))}
      </div>
      {activeStore && (
        <div role="dialog" aria-label={`Detail obchodu ${activeStore.name}`} className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Vybraný obchod</p>
              <h3 className="mt-1 text-xl font-semibold">{activeStore.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{activeStore.address}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeStore.distanceKm != null ? `${activeStore.distanceKm.toFixed(1)} km od vaší polohy · ` : ''}
                {activeStore.hours ?? 'Otevírací doba není zatím známá'}
              </p>
              {activeStore.gps ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  GPS: {activeStore.gps.lat.toFixed(4)}, {activeStore.gps.lng.toFixed(4)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">GPS: zatím není k dispozici</p>
              )}
            </div>
            <button aria-label="Zavřít detail obchodu" onClick={() => setSelected(null)} className="icon-button">
              <X />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {activeStore.availableProducts.map((product) => (
              <span key={product} className="rounded-full bg-card px-3 py-1.5 text-xs font-medium">
                {product}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-xs font-medium">
              <Tag className="h-3 w-3 text-primary" /> {activeStore.dealsCount} akcí na vašem seznamu
            </span>
            <button onClick={() => setSelected(null)} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Vybrat pro nákup
            </button>
          </div>
        </div>
      )}
      {visibleStores.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Žádný obchod neodpovídá hledání.
        </div>
      )}
    </div>
  )
}
