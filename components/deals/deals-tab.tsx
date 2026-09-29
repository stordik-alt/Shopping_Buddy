import { Loader2, Search, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dealsPageAction } from '@/app/actions/deals'
import { DealCard } from '@/components/deals/deal-card'
import { OfferCard } from '@/components/deals/offer-card'
import { Pager } from '@/components/shared/pager'
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
      <div>
        <p className="text-sm text-muted-foreground">Dnešní akce · Česká republika</p>
        <h2 className="mt-1 text-2xl font-semibold">Akce</h2>
        <p className="mt-1 text-sm text-muted-foreground">Procházejte akce podle kategorie, po stránkách.</p>
      </div>

      <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-card px-3 text-sm">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, MAX_DEALS_QUERY_LENGTH))}
          placeholder="Co hledáte? Např. kuřecí maso, vejce, máslo…"
          aria-label="Hledat v akcích"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Vymazat hledání" className="icon-button size-7 shrink-0">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </label>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtr podle kategorie">
        {(['all', ...DEAL_CATEGORIES] as DealCategoryFilter[]).map((value) => (
          <button
            key={value}
            onClick={() => selectCategory(value)}
            aria-pressed={category === value}
            className={`min-h-9 rounded-full px-3 text-sm font-medium transition ${category === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-primary/10'}`}
          >
            {CATEGORY_LABEL[value]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-10 items-center gap-2 rounded-2xl border border-border bg-card px-3 text-sm text-muted-foreground">
          Řetězec
          <select
            value={chain ?? ''}
            onChange={(event) => selectChain(event.target.value === '' ? null : event.target.value)}
            className="min-h-9 min-w-0 flex-1 bg-transparent text-foreground outline-none"
          >
            <option value="">Všechny řetězce</option>
            {chains.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-2xl border border-border bg-card px-3 text-sm text-muted-foreground">
          Řazení
          <select
            value={sort}
            onChange={(event) => selectSort(event.target.value as DealSort)}
            className="min-h-9 min-w-0 flex-1 bg-transparent text-foreground outline-none"
          >
            {DEAL_SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {result.status === 'error' && (
        <div role="alert" className="rounded-2xl bg-muted px-4 py-3 text-sm">
          Akce se nepodařilo načíst.{' '}
          <button onClick={() => setAttempt((n) => n + 1)} className="font-medium text-primary underline">
            Zkusit znovu
          </button>
        </div>
      )}
      {result.status === 'loading' && page_ == null && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Načítám akce…
        </p>
      )}
      {page_ != null && page_.total === 0 && !busy && (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {debouncedQuery.trim()
            ? `Pro „${debouncedQuery.trim()}" jsme žádnou aktivní akci nenašli.`
            : chain
              ? `Pro ${chain} teď nemáme žádné aktivní akce.`
              : 'V této kategorii teď nemáme žádné aktivní akce.'}
          {(debouncedQuery.trim() || chain || category !== 'all') && (
            <div className="mt-3">
              <button
                onClick={() => {
                  setQuery('')
                  setCategory('all')
                  setChain(null)
                  onClearChain()
                  setPage(1)
                }}
                className="min-h-11 rounded-2xl bg-muted px-4 text-sm font-semibold text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Zobrazit všechny akce
              </button>
            </div>
          )}
        </div>
      )}
      {page_ != null && page_.total > 0 && (
        <>
          <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Tag className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /> {activeDealCountLabel(page_.total)}
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
              <p className="mt-1 text-xs text-muted-foreground">U těchto produktů neznáme běžnou cenu, proto je neporovnáváme a neuvádíme slevu.</p>
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
