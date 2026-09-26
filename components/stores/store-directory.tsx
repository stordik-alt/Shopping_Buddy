import { useCallback, useEffect, useMemo, useState } from 'react'
import { storeBranchesAction, storeChainTilesAction, storeProductNamesAction, type LocalityInput } from '@/app/actions/store-directory'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Loader2, LocateFixed, MapPin, Navigation, Star, Tag, X } from 'lucide-react'
import { ChainLogo, chainShortName } from '@/components/stores/chain-logo'
import { activeDealCountLabel } from '@/lib/format'
import type { GpsCoords } from '@/lib/geo'
import { BRANCH_PAGE_SIZE, NEARBY_RADIUS_KM, pageCount } from '@/lib/stores/branch-search'
import type { LocationState } from '@/lib/use-user-location'
import type { BranchPage, ChainTile } from '@/lib/db/store-branch-search'

// The directory holds ~1,800 branches, so none of them is sent to the browser up front: the chain
// tiles for the chosen locality are loaded first, and once the user picks chains, one page of
// branches at a time (app/actions/store-directory.ts). That keeps the page short on a phone and the
// database's network transfer small.

// Wait for a pause in typing before asking the server about a town.
const TYPING_DELAY_MS = 400

type Loadable<T> = { status: 'loading'; previous: T | null } | { status: 'error'; previous: T | null } | { status: 'done'; data: T }

export function StoreDirectory({
  locationState,
  userCoords,
  onRequestLocation,
  onClearLocation,
  onShowDeals,
}: {
  locationState: LocationState
  userCoords: GpsCoords | null
  onRequestLocation: () => void
  onClearLocation: () => void
  /** Opens the promotions of one chain (the deals are published per chain, not per branch). */
  onShowDeals: (chain: string) => void
}) {
  const [city, setCity] = useState('')
  const [debouncedCity, setDebouncedCity] = useState('')
  const [selectedChainIds, setSelectedChainIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [openBranchId, setOpenBranchId] = useState<string | null>(null)
  const [tiles, setTiles] = useState<Loadable<ChainTile[]>>({ status: 'loading', previous: null })
  const [branches, setBranches] = useState<Loadable<BranchPage> | null>(null)
  // Bumped by the "try again" buttons to re-run a failed load.
  const [tilesAttempt, setTilesAttempt] = useState(0)
  const [branchesAttempt, setBranchesAttempt] = useState(0)
  const usingGps = locationState === 'granted' && userCoords != null

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCity(city), TYPING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [city])

  // While using GPS, the real position does the "near me" job, so the typed town is ignored.
  const locality = useMemo<LocalityInput>(() => {
    if (usingGps && userCoords) return { lat: userCoords.lat, lng: userCoords.lng }
    return debouncedCity.trim() === '' ? null : { city: debouncedCity.trim() }
  }, [usingGps, userCoords, debouncedCity])

  // A new locality is a new search: chains and pages of the old one no longer apply.
  useEffect(() => {
    setPage(1)
    setOpenBranchId(null)
  }, [locality])

  useEffect(() => {
    // Only chains that have a branch near the entered town or position are offered, so without either
    // there is nothing to show yet (not the whole country).
    if (locality == null) {
      setTiles({ status: 'done', data: [] })
      setSelectedChainIds([])
      return
    }
    let cancelled = false
    setTiles((current) => ({ status: 'loading', previous: current.status === 'done' ? current.data : current.previous }))
    storeChainTilesAction(locality)
      .then((data) => {
        if (cancelled) return
        setTiles({ status: 'done', data })
        // Keep only the chains that still exist in this locality.
        setSelectedChainIds((current) => current.filter((id) => data.some((tile) => tile.storeId === id)))
      })
      .catch((error) => {
        console.error('Loading store chains failed', error)
        if (!cancelled) setTiles((current) => ({ status: 'error', previous: current.status === 'done' ? current.data : current.previous }))
      })
    return () => {
      cancelled = true
    }
  }, [locality, tilesAttempt])

  useEffect(() => {
    if (selectedChainIds.length === 0) {
      setBranches(null)
      return
    }
    let cancelled = false
    setBranches((current) => ({ status: 'loading', previous: current?.status === 'done' ? current.data : (current?.previous ?? null) }))
    storeBranchesAction({ locality, chainIds: selectedChainIds, page })
      .then((data) => {
        if (cancelled) return
        setBranches({ status: 'done', data })
        // The server answers with the last page when the asked one no longer exists.
        if (data.page !== page) setPage(data.page)
      })
      .catch((error) => {
        console.error('Loading branches failed', error)
        if (!cancelled) setBranches((current) => ({ status: 'error', previous: current?.status === 'done' ? current.data : (current?.previous ?? null) }))
      })
    return () => {
      cancelled = true
    }
  }, [locality, selectedChainIds, page, branchesAttempt])

  const toggleChain = useCallback((storeId: string) => {
    setSelectedChainIds((current) => (current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId]))
    setPage(1)
    setOpenBranchId(null)
  }, [])

  const goToPage = (next: number) => {
    setPage(next)
    setOpenBranchId(null)
  }

  const tileList = tiles.status === 'done' ? tiles.data : tiles.previous
  const tileByChain = new Map((tileList ?? []).map((tile) => [tile.storeId, tile]))
  const branchPage = branches == null ? null : branches.status === 'done' ? branches.data : branches.previous
  const totalPages = branchPage ? pageCount(branchPage.total, BRANCH_PAGE_SIZE) : 1
  const branchesBusy = branches?.status === 'loading'

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Obchody ve vašem okolí · Česká republika</p>
        <h2 className="mt-1 text-2xl font-semibold">Kde nakoupit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Vyberte lokalitu a řetězce, porovnejte otevírací dobu a akce.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {usingGps ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary focus-within:ring-2 focus-within:ring-ring">
            <LocateFixed className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">Prodejny do {NEARBY_RADIUS_KM} km od vaší polohy</span>
            <button onClick={onClearLocation} className="shrink-0 whitespace-nowrap text-xs font-medium underline hover:no-underline">
              Zadat ručně
            </button>
          </div>
        ) : (
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="sr-only">Lokalita</span>
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Město, např. Brno"
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
              aria-label="Lokalita"
              maxLength={80}
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
      </div>
      {locationState === 'denied' && (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">
          Poloha nebyla povolena, obchody zobrazujeme podle zadané lokality. Vzdálenost se používá pouze pro hledání obchodů v okolí a její
          použití můžete kdykoliv odmítnout.
        </p>
      )}

      <section aria-label="Řetězce">
        <p className="mb-2 text-sm font-medium">Řetězce{selectedChainIds.length > 0 && ` · vybráno ${selectedChainIds.length}`}</p>
        {tiles.status === 'error' && (
          <div role="alert" className="rounded-2xl bg-muted px-4 py-3 text-sm">
            Řetězce se nepodařilo načíst.{' '}
            <button onClick={() => setTilesAttempt((n) => n + 1)} className="font-medium text-primary underline">
              Zkusit znovu
            </button>
          </div>
        )}
        {tiles.status === 'loading' && tileList == null && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Načítám řetězce…
          </p>
        )}
        {locality == null && (
          <div className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Zadejte město nebo použijte svou polohu a ukážeme řetězce, které tam mají prodejnu.
          </div>
        )}
        {locality != null && tileList != null && tileList.length === 0 && tiles.status !== 'loading' && (
          <div className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            V této lokalitě nemáme žádné prodejny. Zkuste jiné město nebo použijte svou polohu.
          </div>
        )}
        {locality != null && tileList != null && tileList.length > 0 && (
          <ul className={`grid grid-cols-3 gap-2 ${tiles.status === 'loading' ? 'opacity-60' : ''}`} aria-busy={tiles.status === 'loading'}>
            {tileList.map((tile) => {
              const selected = selectedChainIds.includes(tile.storeId)
              return (
                <li key={tile.storeId}>
                  {/* A square tile: the logo with the chain's name under it. The name is shortened
                      (chainShortName) and never wraps, so a long name cannot break the grid. */}
                  <button
                    onClick={() => toggleChain(tile.storeId)}
                    aria-pressed={selected}
                    aria-label={tile.chain}
                    className={`relative flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border p-2 transition ${selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:bg-muted/60'}`}
                  >
                    <ChainLogo chain={tile.chain} className="size-12" />
                    <span className="w-full truncate text-center text-xs font-semibold">{chainShortName(tile.chain)}</span>
                    {tile.isFavorite && <Star className="absolute right-1.5 top-1.5 h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="Váš oblíbený řetězec" />}
                    {selected && <Check className="absolute left-1.5 top-1.5 h-4 w-4 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selectedChainIds.length === 0 && locality != null && tileList != null && tileList.length > 0 && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Vyberte jeden nebo více řetězců a zobrazíme jejich prodejny.</p>
      )}

      {branches?.status === 'error' && (
        <div role="alert" className="rounded-2xl bg-muted px-4 py-3 text-sm">
          Prodejny se nepodařilo načíst.{' '}
          <button onClick={() => setBranchesAttempt((n) => n + 1)} className="font-medium text-primary underline">
            Zkusit znovu
          </button>
        </div>
      )}
      {branches?.status === 'loading' && branchPage == null && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Načítám prodejny…
        </p>
      )}
      {branchPage != null && branchPage.total === 0 && !branchesBusy && (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Vybrané řetězce tu nemají žádnou prodejnu. Zkuste jiné řetězce nebo lokalitu.
        </div>
      )}
      {branchPage != null && branchPage.total > 0 && (
        <section aria-label="Prodejny">
          <ul className={`grid gap-3 sm:grid-cols-2 ${branchesBusy ? 'opacity-60' : ''}`} aria-busy={branchesBusy}>
            {branchPage.rows.map((branch) => {
              const expanded = branch.id === openBranchId
              const deals = tileByChain.get(branch.storeId)?.dealsCount ?? 0
              return (
                <li key={branch.id} className="surface overflow-hidden">
                  <button
                    onClick={() => setOpenBranchId(expanded ? null : branch.id)}
                    aria-expanded={expanded}
                    aria-controls={`store-detail-${branch.id}`}
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/60"
                  >
                    <ChainLogo chain={branch.chain} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-1 text-sm font-semibold">
                        <span className="min-w-0 break-words">{branch.name}</span>
                        {branch.isFavorite && <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Vaše oblíbená prodejna" />}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                        {branch.distanceKm != null && <span className="font-medium text-foreground">{branch.distanceKm.toFixed(1)} km · </span>}
                        {branch.address}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" /> {branch.hours ?? 'Otevírací doba neznámá'}
                        </span>
                        {deals > 0 && (
                          <span className="flex items-center gap-1 font-medium text-primary">
                            <Tag className="h-3 w-3 shrink-0" /> {activeDealCountLabel(deals)} v řetězci
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {/* The detail opens under the tapped row, not after the whole list, so a tap on a
                      phone visibly does something. */}
                  {expanded && (
                    <div id={`store-detail-${branch.id}`} className="border-t border-border bg-primary/5 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-primary">Detail prodejny</p>
                        <button aria-label={`Zavřít detail obchodu ${branch.name}`} onClick={() => setOpenBranchId(null)} className="icon-button -m-2">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <StoreProducts storeLocationId={branch.id} />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {branch.gps && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${branch.gps.lat},${branch.gps.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground"
                          >
                            <Navigation className="h-3.5 w-3.5" /> Navigovat
                          </a>
                        )}
                        <button
                          onClick={() => onShowDeals(branch.chain)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-primary bg-card px-4 text-xs font-medium text-primary"
                        >
                          <Tag className="h-3.5 w-3.5" /> Zobrazit akce
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="Stránkování prodejen" className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || branchesBusy}
                aria-label="Předchozí stránka"
                className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-14 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {page}/{totalPages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages || branchesBusy}
                aria-label="Další stránka"
                className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </nav>
          )}
        </section>
      )}

      {/* Branch locations, addresses and opening hours come from OpenStreetMap (lib/stores/osm.ts);
          its licence (ODbL) requires this attribution wherever the data is shown. Chain logos are
          trademarks of their owners (public/logos/README.md). */}
      <p className="text-xs text-muted-foreground">
        Prodejny, adresy a otevírací doby:{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
          © přispěvatelé OpenStreetMap
        </a>
        . Loga jsou ochranné známky jejich vlastníků.
      </p>
    </div>
  )
}

/** Products with a known price at one branch, loaded when its detail opens — not with every page
 *  render, which is what used up the database's network transfer (lib/db/queries.ts getStores). */
function StoreProducts({ storeLocationId }: { storeLocationId: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'done'; names: string[] }>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    storeProductNamesAction(storeLocationId)
      .then((names) => {
        if (!cancelled) setState({ status: 'done', names })
      })
      .catch((error) => {
        console.error('Loading branch products failed', error)
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [storeLocationId])

  if (state.status === 'loading') {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Načítám produkty…
      </p>
    )
  }
  if (state.status === 'error') return <p className="mt-2 text-xs text-destructive">Produkty se nepodařilo načíst. Zkuste detail otevřít znovu.</p>
  if (state.names.length === 0) return <p className="mt-2 text-xs text-muted-foreground">U této prodejny zatím neznáme žádné ceny.</p>
  return (
    <>
      <p className="mt-2 text-xs text-muted-foreground">Produkty, u kterých tu známe cenu:</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {state.names.map((product) => (
          <span key={product} className="rounded-full bg-card px-3 py-1.5 text-xs font-medium">
            {product}
          </span>
        ))}
      </div>
    </>
  )
}
