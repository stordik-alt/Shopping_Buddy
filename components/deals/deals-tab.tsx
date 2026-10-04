import { Search, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dealsPageAction } from '@/app/actions/deals'
import { DealCard } from '@/components/deals/deal-card'
import { OfferCard } from '@/components/deals/offer-card'
import { Pager } from '@/components/shared/pager'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { DEAL_CATEGORIES, DEALS_PAGE_SIZE, DEAL_SORTS, MAX_DEALS_QUERY_LENGTH, type DealCategoryFilter, type DealSort } from '@/lib/deals-browse'
import { activeDealCountLabel } from '@/lib/format'
import type { DealsPage } from '@/lib/db/deals'
import { pageCount } from '@/lib/paging'
import type { PantryItem } from '@/lib/types'

// Debounced the same way the store directory's town search is (components/stores/store-directory.tsx)
// so typing "kuřecí maso" does not fire a server query after every keystroke.
const TYPING_DELAY_MS = 400

// Today's promotions, browsed by category and page instead of loaded all at once (the home screen
// used to do that — docs/07_CHANGELOG.md, 2026-09-27, the owner's own words: too many to scroll
// through). Only the current page's products get their full price detail loaded
// (app/actions/deals.ts → lib/db/deals.ts); everything else stays server-side.

type Loadable<T> = { status: 'loading'; previous: T | null } | { status: 'error'; previous: T | null } | { status: 'done'; data: T }

const CATEGORY_LABEL: Record<DealCategoryFilter, string> = {
  all: 'Vše',
  Potraviny: 'Potraviny',
  Drogerie: 'Drogerie',
  Děti: 'Děti',
  Domácnost: 'Domácnost',
  Ostatní: 'Ostatní',
}

const SORT_LABEL: Record<DealSort, string> = {
  name: 'Podle názvu (A–Z)',
  price: 'Podle ceny (od nejnižší)',
  discount: 'Podle velikosti slevy',
  store: 'Podle obchodu',
}

export function DealsTab({
  chains,
  listItemNames,
  onAddToList,
  pantryItems,
  initialChain,
  onClearChain,
}: {
  /** Every store chain, for the filter — the same list the profile's store picker uses (already
   *  loaded for the shopping planner, so this needs no extra query). */
  chains: string[]
  listItemNames: string[]
  onAddToList: (name: string) => void
  pantryItems: PantryItem[]
  /** A chain preset by "Zobrazit akce" in the store directory branch detail. */
  initialChain: string | null
  onClearChain: () => void
}) {
  const [category, setCategory] = useState<DealCategoryFilter>('all')
  const [chain, setChain] = useState(initialChain)
  const [sort, setSort] = useState<DealSort>('name')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Loadable<DealsPage>>({ status: 'loading', previous: null })
  const [attempt, setAttempt] = useState(0)

  // A fresh "Zobrazit akce" click while the tab is already open should apply the new chain, and start
  // from its first page.
  useEffect(() => {
    setChain(initialChain)
    setPage(1)
  }, [initialChain])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), TYPING_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  // A fresh search should start from page 1, same as changing category/chain does.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  useEffect(() => {
    let cancelled = false
    setResult((current) => ({ status: 'loading', previous: current.status === 'done' ? current.data : current.previous }))
    dealsPageAction({ category, chain, sort, page, query: debouncedQuery.trim() || null })
      .then((data) => {
        if (cancelled) return
        setResult({ status: 'done', data })
        // The server answers with the last page when the asked one no longer exists.
        if (data.page !== page) setPage(data.page)
      })
      .catch((error) => {
        console.error('Loading deals failed', error)
        if (!cancelled) setResult((current) => ({ status: 'error', previous: current.status === 'done' ? current.data : current.previous }))
      })
    return () => {
      cancelled = true
    }
  }, [category, chain, sort, page, debouncedQuery, attempt])

  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  const isOnList = (name: string) => onList.has(name.trim().toLowerCase())

  const selectCategory = (next: DealCategoryFilter) => {
    setCategory(next)
    setPage(1)
  }
  // A manual choice here replaces whatever "Zobrazit akce" preset brought the user to this tab, so a
  // later switch away and back does not silently reapply it.
  const selectChain = (next: string | null) => {
    setChain(next)
    setPage(1)
    onClearChain()
  }
  const selectSort = (next: DealSort) => {
    setSort(next)
    setPage(1)
  }

  const page_ = result.status === 'done' ? result.data : result.previous
  const busy = result.status === 'loading'
  const totalPages = page_ ? pageCount(page_.total, DEALS_PAGE_SIZE) : 1

  return (
    <div className="space-y-5">
      {/* The tab name is already the page heading; one line of context is enough. */}
      <p className="text-sm text-fg-secondary">Dnešní akce v Česku — podle kategorie, řetězce a po stránkách.</p>

      <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-input bg-card pl-4 pr-1 text-base focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
        <Search className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, MAX_DEALS_QUERY_LENGTH))}
          placeholder="Co hledáte? Např. kuřecí maso, vejce, máslo…"
          aria-label="Hledat v akcích"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-fg-muted"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Vymazat hledání" className="icon-button shrink-0">
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </label>

      <SegmentedControl
        label="Filtr podle kategorie"
        value={category}
        onChange={selectCategory}
        options={(['all', ...DEAL_CATEGORIES] as DealCategoryFilter[]).map((value) => ({ value, label: CATEGORY_LABEL[value] }))}
      />
      <div className="grid gap-3 min-[380px]:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Řetězec</span>
          <Select value={chain ?? ''} onChange={(event) => selectChain(event.target.value === '' ? null : event.target.value)}>
            <option value="">Všechny řetězce</option>
            {chains.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Řazení</span>
          <Select value={sort} onChange={(event) => selectSort(event.target.value as DealSort)}>
            {DEAL_SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABEL[value]}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {result.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-destructive-subtle px-4 py-3 text-sm text-destructive">
          Akce se nepodařilo načíst.
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            Zkusit znovu
          </Button>
        </div>
      )}
      {result.status === 'loading' && page_ == null && (
        <div role="status" aria-label="Načítám akce" className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      )}
      {page_ != null && page_.total === 0 && !busy && (
        <EmptyState
          icon={<Tag />}
          title={
            debouncedQuery.trim()
              ? `Pro „${debouncedQuery.trim()}" jsme žádnou aktivní akci nenašli.`
              : chain
                ? `Pro ${chain} teď nemáme žádné aktivní akce.`
                : 'V této kategorii teď nemáme žádné aktivní akce.'
          }
          action={
            debouncedQuery.trim() || chain || category !== 'all' ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setChain(null)
                  onClearChain()
                  setPage(1)
                }}
              >
                Zobrazit všechny akce
              </Button>
            ) : undefined
          }
        />
      )}
      {page_ != null && page_.total > 0 && (
        <>
          <p className="flex items-center gap-2 text-sm text-fg-secondary" aria-live="polite">
            <Tag className="size-4 shrink-0 text-accent-text" aria-hidden="true" /> {activeDealCountLabel(page_.total)}
          </p>
          {page_.deals.length > 0 && (
            <section aria-label="Akce">
              <div className={`grid gap-3 md:grid-cols-3 ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
                {page_.deals.map((assessment) => (
                  <DealCard
                    key={`${assessment.product.productName}-${assessment.price.store}`}
                    assessment={assessment}
                    isOnList={isOnList(assessment.product.productName)}
                    onAddToList={onAddToList}
                    pantryItems={pantryItems}
                  />
                ))}
              </div>
            </section>
          )}
          {page_.offers.length > 0 && (
            <section aria-label="Další nabídky obchodů">
              <p className="text-sm font-medium">Další nabídky obchodů</p>
              <p className="mt-1 text-xs text-fg-muted">U těchto produktů neznáme běžnou cenu, proto je neporovnáváme a neuvádíme slevu.</p>
              <div className={`mt-3 grid gap-3 md:grid-cols-3 ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
                {page_.offers.map((offer) => (
                  <OfferCard key={`${offer.productName}-${offer.store}`} offer={offer} />
                ))}
              </div>
            </section>
          )}
          {totalPages > 1 && <Pager page={page_.page} totalPages={totalPages} busy={busy} onChange={setPage} label="Stránkování akcí" />}
        </>
      )}
    </div>
  )
}
