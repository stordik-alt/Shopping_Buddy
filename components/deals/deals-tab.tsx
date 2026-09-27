import { ChevronLeft, ChevronRight, Loader2, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dealsPageAction } from '@/app/actions/deals'
import { DealCard } from '@/components/deals/deal-card'
import { OfferCard } from '@/components/deals/offer-card'
import { DEAL_CATEGORIES, DEALS_PAGE_SIZE, type DealCategoryFilter } from '@/lib/deals-browse'
import { activeDealCountLabel } from '@/lib/format'
import type { DealsPage } from '@/lib/db/deals'
import { pageCount } from '@/lib/paging'
import type { PantryItem } from '@/lib/types'

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

export function DealsTab({
  listItemNames,
  onAddToList,
  pantryItems,
  initialChain,
  onClearChain,
}: {
  listItemNames: string[]
  onAddToList: (name: string) => void
  pantryItems: PantryItem[]
  /** A chain preset by "Zobrazit akce" in the store directory branch detail. */
  initialChain: string | null
  onClearChain: () => void
}) {
  const [category, setCategory] = useState<DealCategoryFilter>('all')
  const [chain, setChain] = useState(initialChain)
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
    let cancelled = false
    setResult((current) => ({ status: 'loading', previous: current.status === 'done' ? current.data : current.previous }))
    dealsPageAction({ category, chain, page })
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
  }, [category, chain, page, attempt])

  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  const isOnList = (name: string) => onList.has(name.trim().toLowerCase())

  const selectCategory = (next: DealCategoryFilter) => {
    setCategory(next)
    setPage(1)
  }
  const clearChain = () => {
    setChain(null)
    setPage(1)
    onClearChain()
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
      {chain && (
        <button
          onClick={clearChain}
          aria-label={`Zrušit filtr řetězce ${chain}`}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary"
        >
          {chain} <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

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
          {chain ? `Pro ${chain} teď nemáme žádné aktivní akce.` : 'V této kategorii teď nemáme žádné aktivní akce.'}
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
          {totalPages > 1 && <Pager page={page_.page} totalPages={totalPages} busy={busy} onChange={setPage} />}
        </>
      )}
    </div>
  )
}

/** `‹ page/total ›`, the same shape as the store directory's branch pager. */
function Pager({ page, totalPages, busy, onChange }: { page: number; totalPages: number; busy: boolean; onChange: (page: number) => void }) {
  return (
    <nav aria-label="Stránkování akcí" className="flex items-center justify-center gap-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1 || busy}
        aria-label="Předchozí stránka"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="min-w-14 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {page}/{totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages || busy}
        aria-label="Další stránka"
        className="flex size-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted disabled:opacity-40"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </nav>
  )
}
