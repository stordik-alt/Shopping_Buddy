import { useState } from 'react'
import { ArrowUpRight, MapPin, Search, X } from 'lucide-react'

const STORES = [
  { name: 'Lidl', detail: '2 akce na vašem seznamu', distance: '0,8 km', hours: 'Otevřeno do 21:00', color: 'bg-[#d7f36b]' },
  { name: 'Albert', detail: 'Nejbližší obchod', distance: '1,2 km', hours: 'Otevřeno do 22:00', color: 'bg-[#f4b183]' },
  { name: 'Kaufland', detail: '8 aktivních nabídek', distance: '2,4 km', hours: 'Otevřeno do 21:00', color: 'bg-[#b9d8f5]' },
  { name: 'Billa', detail: '4 akce v okolí', distance: '1,8 km', hours: 'Otevřeno do 21:00', color: 'bg-[#f3c0d3]' },
]

export function StoreDirectory() {
  const [location, setLocation] = useState('Praha 4')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const visibleStores = STORES.filter((store) => store.name.toLowerCase().includes(query.toLowerCase()))
  const activeStore = STORES.find((store) => store.name === selected)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Obchody ve vašem okolí</p>
        <h2 className="mt-1 text-2xl font-semibold">Kde nakoupit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Porovnejte vzdálenost, otevírací dobu a akce.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="sr-only">Lokalita</span>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
            aria-label="Lokalita"
          />
        </label>
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
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleStores.map((store) => (
          <button
            key={store.name}
            onClick={() => setSelected(store.name)}
            className="rounded-3xl border border-border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className={`flex h-16 items-center justify-between rounded-2xl ${store.color} px-4 text-2xl font-bold text-foreground`}>
              <span>{store.name}</span>
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <p className="mt-4 text-sm font-semibold">{store.detail}</p>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{store.distance}</span>
              <span>{store.hours}</span>
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
              <p className="mt-1 text-sm text-muted-foreground">
                {activeStore.distance} od lokality {location} · {activeStore.hours}
              </p>
            </div>
            <button aria-label="Zavřít detail obchodu" onClick={() => setSelected(null)} className="icon-button">
              <X />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-card px-3 py-1.5 text-xs font-medium">2 akce na vašem seznamu</span>
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
