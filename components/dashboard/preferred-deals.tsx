import { useEffect, useState } from 'react'
import { Check, ChevronRight, Heart, Plus } from 'lucide-react'
import { dealsPageAction } from '@/app/actions/deals'
import { Badge } from '@/components/ui/badge'
import type { DealsPage } from '@/lib/db/deals'
import { money } from '@/lib/format'
import { shortOfferDate } from '@/lib/offers'
import { dealDiscount, effectivePrice } from '@/lib/prices'

/** How many deals the home card shows; the rest are in Akce ▸ Pro mě. */
const SHOWN = 3

/** Domů: deals on the household's preferred products and brands (docs/16_PREFERENCE_DEALS.md), as short
 *  rows — the full cards with their price history are in Akce ▸ Pro mě. Loaded after the page, through the
 *  same cached Akce query; shown only when something matches. */
export function PreferredDeals({
  hasPreferences,
  listItemNames,
  onAddToList,
  onShowAll,
}: {
  /** Whether the household has any preferred product or brand; without one nothing is asked. */
  hasPreferences: boolean
  listItemNames: string[]
  onAddToList: (name: string) => void
  onShowAll: () => void
}) {
  const [page, setPage] = useState<DealsPage | null>(null)

  useEffect(() => {
    if (!hasPreferences) {
      setPage(null)
      return
    }
    let cancelled = false
    dealsPageAction({ category: 'all', chain: null, sort: 'discount', page: 1, forMe: true }).then(
      (data) => !cancelled && setPage(data),
      // A secondary card: if it cannot load, the home screen simply goes without it.
      (error: unknown) => console.error('Loading preferred deals failed', error),
    )
    return () => {
      cancelled = true
    }
  }, [hasPreferences])

  if (!page || page.total === 0) return null
  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  // Deals with a real discount first, then offers without a known regular price (no discount invented).
  const rows = [
    ...page.deals.map((assessment) => ({
      name: assessment.product.productName,
      store: assessment.price.store,
      until: assessment.price.dealValidUntil ?? '',
      price: effectivePrice(assessment.price),
      discount: Math.round(dealDiscount(assessment.price) * 100),
    })),
    ...page.offers.map((offer) => ({ name: offer.productName, store: offer.store, until: offer.validUntil, price: offer.dealPrice, discount: null })),
  ].slice(0, SHOWN)

  return (
    <section className="surface p-5 sm:p-6" aria-label="Akce na vaše oblíbené">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Heart className="size-4 shrink-0 text-accent-text" aria-hidden="true" /> Akce na vaše oblíbené
          </p>
          <p className="mt-1 text-sm text-fg-secondary">Podle oblíbených produktů a značek v profilu.</p>
        </div>
        <button
          type="button"
          onClick={onShowAll}
          className="flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-medium text-accent-text hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Všechny ({page.total}) <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {rows.map((row) => {
          const listed = onList.has(row.name.trim().toLowerCase())
          return (
            <li key={`${row.name}-${row.store}`} className="flex items-center gap-3 rounded-2xl bg-muted px-3 py-2.5 sm:px-4">
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium">{row.name}</span>
                <span className="block text-xs text-fg-muted">
                  {row.store}
                  {row.until && ` · do ${shortOfferDate(row.until)}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold">{money(row.price)}</span>
                {row.discount != null && row.discount > 0 && <Badge tone="accent">-{row.discount} %</Badge>}
              </span>
              <button
                type="button"
                onClick={() => onAddToList(row.name)}
                disabled={listed}
                aria-label={listed ? `${row.name} je na seznamu` : `Přidat ${row.name} na seznam`}
                className="icon-button shrink-0 disabled:opacity-60"
              >
                {listed ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
