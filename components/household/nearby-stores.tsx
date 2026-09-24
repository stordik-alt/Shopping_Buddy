import { useState } from 'react'
import { Check, ChevronDown, Loader2, MapPin } from 'lucide-react'
import { storeCountLabel } from '@/lib/format'
import { MAX_DISTANCE_KM, normalizeDistanceKm, parseDistanceInput, type StoreSelection } from '@/lib/nearby-stores'
import type { Store } from '@/lib/types'

const QUICK_DISTANCES_KM = [0.5, 1, 2, 5, 10]

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value))

/** The signed-in user's own answer to "which stores are in my area, and how far will I go for a
 *  shop" — chains, optionally specific branches (`stores`, only those with a chain id), and a
 *  distance. Personal (each member has their own). Until every branch has GPS the chosen stores are
 *  what makes a store nearby; the distance is saved for when they do (lib/nearby-stores.ts). */
export function NearbyStores({
  chains,
  stores,
  selection,
  onSave,
}: {
  chains: { id: string; chain: string }[]
  stores: Store[]
  selection: StoreSelection
  onSave: (input: { maxDistanceKm: number | null; chainIds: string[]; locationIds: string[] }) => Promise<StoreSelection>
}) {
  // What is currently saved; "unsaved changes" is measured against this, and it moves forward when a
  // save succeeds, so the component does not depend on its parent feeding the new value back in.
  const [baseline, setBaseline] = useState(selection)
  const [chainIds, setChainIds] = useState<string[]>(selection.chainIds)
  const [locationIds, setLocationIds] = useState<string[]>(selection.branches.map((branch) => branch.storeLocationId))
  const [distanceText, setDistanceText] = useState(selection.maxDistanceKm != null ? String(selection.maxDistanceKm).replace('.', ',') : '')
  const [openChain, setOpenChain] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  const branchesByChain = new Map<string, Store[]>()
  for (const store of stores) {
    if (!store.storeId) continue
    branchesByChain.set(store.storeId, [...(branchesByChain.get(store.storeId) ?? []), store])
  }

  const distance = parseDistanceInput(distanceText)
  const distanceInvalid = distance !== null && normalizeDistanceKm(distance) === null
  const dirty =
    !sameSet(chainIds, baseline.chainIds) ||
    !sameSet(locationIds, baseline.branches.map((branch) => branch.storeLocationId)) ||
    (distanceInvalid ? true : normalizeDistanceKm(distance) !== baseline.maxDistanceKm)

  function touch() {
    setStatus('idle')
    setError('')
  }

  function toggleChain(chainId: string) {
    touch()
    if (chainIds.includes(chainId)) {
      // A branch cannot outlive its chain.
      const ofChain = new Set((branchesByChain.get(chainId) ?? []).map((store) => store.id))
      setChainIds(chainIds.filter((id) => id !== chainId))
      setLocationIds(locationIds.filter((id) => !ofChain.has(id)))
      if (openChain === chainId) setOpenChain(null)
    } else {
      setChainIds([...chainIds, chainId])
    }
  }

  function toggleBranch(store: Store) {
    touch()
    if (locationIds.includes(store.id)) {
      setLocationIds(locationIds.filter((id) => id !== store.id))
    } else {
      setLocationIds([...locationIds, store.id])
      // Picking a branch selects its chain too.
      if (store.storeId && !chainIds.includes(store.storeId)) setChainIds([...chainIds, store.storeId])
    }
  }

  async function save() {
    if (distanceInvalid || Number.isNaN(distance)) {
      setStatus('error')
      setError(`Vzdálenost musí být číslo mezi 0,1 a ${MAX_DISTANCE_KM} km.`)
      return
    }
    setStatus('saving')
    setError('')
    try {
      const saved = await onSave({ maxDistanceKm: distance, chainIds, locationIds })
      setBaseline(saved)
      setChainIds(saved.chainIds)
      setLocationIds(saved.branches.map((branch) => branch.storeLocationId))
      setDistanceText(saved.maxDistanceKm != null ? String(saved.maxDistanceKm).replace('.', ',') : '')
      setStatus('saved')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Nastavení se nepodařilo uložit.')
    }
  }

  return (
    <section className="surface p-6" aria-labelledby="nearby-stores-title">
      <div className="flex items-start gap-3">
        <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p id="nearby-stores-title" className="font-semibold">Moje obchody v okolí</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Vyberte obchody, které máte poblíž. Ceny a plánování nákupu pak počítají jen s nimi. Nastavení je jen vaše, ostatní členové domácnosti mají své.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium">Obchodní řetězce</p>
        {chains.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Zatím nemáme žádné obchody k výběru.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {chains.map(({ id, chain }) => {
              const selected = chainIds.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleChain(id)}
                  className={`flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {selected && <Check className="h-4 w-4" />}
                  {chain}
                </button>
              )
            })}
          </div>
        )}
        {chainIds.length === 0 && chains.length > 0 && (
          <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            Zatím nemáte vybrané žádné obchody, takže se zobrazují ceny ze všech.
          </p>
        )}
      </div>

      {chainIds.some((id) => (branchesByChain.get(id) ?? []).length > 0) && (
        <div className="mt-5">
          <p className="text-sm font-medium">Konkrétní prodejny <span className="font-normal text-muted-foreground">(volitelné)</span></p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Bez vybrané prodejny se počítá celý řetězec. Svou prodejnu tu nenajdete? Stačí zůstat u řetězce.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {chains
              .filter(({ id }) => chainIds.includes(id) && (branchesByChain.get(id) ?? []).length > 0)
              .map(({ id, chain }) => {
                const branches = branchesByChain.get(id) ?? []
                const pickedCount = branches.filter((store) => locationIds.includes(store.id)).length
                const expanded = openChain === id
                return (
                  <div key={id} className="rounded-2xl border border-border">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpenChain(expanded ? null : id)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        {chain}
                        <span className="ml-2 font-normal text-muted-foreground">{pickedCount > 0 ? `vybráno ${pickedCount} z ${branches.length}` : storeCountLabel(branches.length)}</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                    {expanded && (
                      <ul className="flex flex-col border-t border-border">
                        {branches.map((store) => (
                          <li key={store.id}>
                            <label className="flex min-h-11 cursor-pointer items-start gap-3 px-4 py-2 text-sm hover:bg-muted/60">
                              <input
                                type="checkbox"
                                checked={locationIds.includes(store.id)}
                                onChange={() => toggleBranch(store)}
                                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                              />
                              <span className="min-w-0 break-words">
                                {store.name}
                                <span className="block text-xs text-muted-foreground">{[store.address, store.city].filter(Boolean).join(', ')}</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}

      <div className="mt-5">
        <label htmlFor="nearby-distance" className="text-sm font-medium">Kolik km jsem ochoten dojít nebo dojet kvůli nákupu</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="nearby-distance"
            inputMode="decimal"
            value={distanceText}
            onChange={(event) => {
              touch()
              setDistanceText(event.target.value)
            }}
            placeholder="Např. 2"
            aria-invalid={distanceInvalid || Number.isNaN(distance)}
            className="min-h-11 w-28 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">km</span>
          {QUICK_DISTANCES_KM.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => {
                touch()
                setDistanceText(String(km).replace('.', ','))
              }}
              className="min-h-11 rounded-full border border-border bg-background px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {String(km).replace('.', ',')} km
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Vzdálenost se uloží a použije, jakmile budou mít prodejny polohu. Do té doby rozhoduje váš výběr obchodů.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || status === 'saving'}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {status === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
          Uložit obchody
        </button>
        {status === 'saved' && !dirty && (
          <span role="status" className="flex items-center gap-1 text-sm text-success">
            <Check className="h-4 w-4" /> Uloženo
          </span>
        )}
        {status === 'error' && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>
    </section>
  )
}
