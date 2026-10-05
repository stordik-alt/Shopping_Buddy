import { useCallback, useEffect, useMemo, useState } from 'react'
import { storeBranchesAction, storeChainTilesAction, storeProductNamesAction, type LocalityInput } from '@/app/actions/store-directory'
import { Check, ChevronDown, Clock, Loader2, LocateFixed, MapPin, Navigation, Star, Store, Tag, X } from 'lucide-react'
import { Pager } from '@/components/shared/pager'
import { ChainLogo, chainShortName } from '@/components/stores/chain-logo'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
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
        <h2 className="text-2xl font-semibold tracking-tight">Kde nakoupit</h2>
        <p className="mt-1 text-sm text-fg-secondary">Vyberte lokalitu a řetězce, porovnejte otevírací dobu a akce.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {usingGps ? (
          <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-accent-subtle px-4 py-1.5 text-sm text-accent-text">
            <LocateFixed className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 font-medium">Prodejny do {NEARBY_RADIUS_KM} km od vaší polohy</span>
            <button type="button" onClick={onClearLocation} className="min-h-10 shrink-0 whitespace-nowrap rounded-lg px-2 text-sm font-medium underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Zadat ručně
            </button>
          </div>
        ) : (
          <label className="flex min-h-12 min-w-[12rem] flex-1 items-center gap-2 rounded-2xl border border-input bg-card px-4 text-base text-fg-muted focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
            <MapPin className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
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
          <Button variant="outline" size="lg" className="min-h-12 rounded-2xl" onClick={onRequestLocation} disabled={locationState === 'loading'}>
            {locationState === 'loading' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LocateFixed className="text-accent-text" aria-hidden="true" />}
            Použít mou polohu
          </Button>
        )}
      </div>
      {locationState === 'denied' && (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm text-fg-secondary">
          Poloha nebyla povolena, obchody zobrazujeme podle zadané lokality. Vzdálenost se používá pouze pro hledání obchodů v okolí a její
          použití můžete kdykoliv odmítnout.
        </p>
      )}

      <section aria-label="Řetězce">
        <p className="mb-2 text-sm font-medium">Řetězce{selectedChainIds.length > 0 && ` · vybráno ${selectedChainIds.length}`}</p>
        {tiles.status === 'error' && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-destructive-subtle px-4 py-3 text-sm text-destructive">
            Řetězce se nepodařilo načíst.
            <Button variant="outline" onClick={() => setTilesAttempt((n) => n + 1)}>
              Zkusit znovu
            </Button>
          </div>
        )}
        {tiles.status === 'loading' && tileList == null && (
          <div role="status" aria-label="Načítám řetězce" className="grid grid-cols-3 gap-2">
            <Skeleton className="aspect-square" />
            <Skeleton className="aspect-square" />
            <Skeleton className="aspect-square" />
          </div>
        )}
        {locality == null && (
          <EmptyState icon={<MapPin />} title="Kde chcete nakupovat?" description="Zadejte město nebo použijte svou polohu a ukážeme řetězce, které tam mají prodejnu." />
        )}
        {locality != null && tileList != null && tileList.length === 0 && tiles.status !== 'loading' && (
          <EmptyState icon={<Store />} title="Tady nemáme žádné prodejny" description="Zkuste jiné město nebo použijte svou polohu." />
        )}
        {locality != null && tileList != null && tileList.length > 0 && (
          <ul className={`grid grid-cols-3 gap-2 min-[380px]:grid-cols-4 sm:grid-cols-6 ${tiles.status === 'loading' ? 'opacity-60' : ''}`} aria-busy={tiles.status === 'loading'}>
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
                    className={`relative flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-accent-solid bg-accent-subtle' : 'border-transparent bg-card shadow-[var(--shadow-card)] hover:bg-muted/60'}`}
                  >
                    <ChainLogo chain={tile.chain} className="size-10" />
                    <span className="w-full truncate text-center text-xs font-semibold">{chainShortName(tile.chain)}</span>
                    {tile.isFavorite && <Star className="absolute right-1.5 top-1.5 size-3.5 fill-current text-warning" aria-label="Váš oblíbený řetězec" />}
                    {selected && (
                      <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent-solid text-accent-solid-foreground" aria-hidden="true">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {selectedChainIds.length === 0 && locality != null && tileList != null && tileList.length > 0 && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-fg-secondary">Vyberte jeden nebo více řetězců a zobrazíme jejich prodejny.</p>
      )}

      {branches?.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-destructive-subtle px-4 py-3 text-sm text-destructive">
          Prodejny se nepodařilo načíst.
          <Button variant="outline" onClick={() => setBranchesAttempt((n) => n + 1)}>
            Zkusit znovu
          </Button>
        </div>
      )}
      {branches?.status === 'loading' && branchPage == null && (
        <div role="status" aria-label="Načítám prodejny" className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {branchPage != null && branchPage.total === 0 && !branchesBusy && (
        <EmptyState icon={<Store />} title="Vybrané řetězce tu nemají prodejnu" description="Zkuste jiné řetězce nebo lokalitu." />
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
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <ChainLogo chain={branch.chain} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-1 text-sm font-semibold">
                        <span className="min-w-0 break-words">{branch.name}</span>
                        {branch.isFavorite && <Star className="mt-0.5 size-3.5 shrink-0 fill-current text-warning" aria-label="Vaše oblíbená prodejna" />}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-fg-secondary">
                        {branch.distanceKm != null && <span className="font-medium text-foreground">{branch.distanceKm.toFixed(1)} km · </span>}
                        {branch.address}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3.5 shrink-0" aria-hidden="true" /> {branch.hours ?? 'Otevírací doba neznámá'}
                        </span>
                        {deals > 0 && (
                          <span className="flex items-center gap-1 font-medium text-accent-text">
                            <Tag className="size-3.5 shrink-0" aria-hidden="true" /> {activeDealCountLabel(deals)} v řetězci
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronDown className={`size-4 shrink-0 text-fg-muted transition ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {/* The detail opens under the tapped row, not after the whole list, so a tap on a
                      phone visibly does something. */}
                  {expanded && (
                    <div id={`store-detail-${branch.id}`} className="border-t border-border bg-accent-subtle/50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">Detail prodejny</p>
                        <button type="button" aria-label={`Zavřít detail obchodu ${branch.name}`} onClick={() => setOpenBranchId(null)} className="icon-button -m-2">
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <StoreProducts storeLocationId={branch.id} />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {branch.gps && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${branch.gps.lat},${branch.gps.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={buttonVariants({ size: 'lg' })}
                          >
                            <Navigation aria-hidden="true" /> Navigovat
                          </a>
                        )}
                        <Button variant="outline" size="lg" onClick={() => onShowDeals(branch.chain)}>
                          <Tag aria-hidden="true" /> Zobrazit akce
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {totalPages > 1 && (
            <div className="mt-4">
              <Pager page={page} totalPages={totalPages} busy={branchesBusy} onChange={goToPage} label="Stránkování prodejen" />
            </div>
          )}
        </section>
      )}

      {/* Branch locations, addresses and opening hours come from OpenStreetMap (lib/stores/osm.ts);
          its licence (ODbL) requires this attribution wherever the data is shown. Chain logos are
          trademarks of their owners (public/logos/README.md). */}
      <p className="text-xs text-fg-muted">
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
      <p role="status" className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Načítám produkty…
      </p>
    )
  }
  if (state.status === 'error') return <p role="alert" className="mt-2 text-sm text-destructive">Produkty se nepodařilo načíst. Zkuste detail otevřít znovu.</p>
  if (state.names.length === 0) return <p className="mt-2 text-sm text-fg-muted">U této prodejny zatím neznáme žádné ceny.</p>
  return (
    <>
      <p className="mt-2 text-sm text-fg-secondary">Produkty, u kterých tu známe cenu:</p>
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
