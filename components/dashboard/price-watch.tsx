import { ArrowUpRight, Tag } from 'lucide-react'
import { DealCard } from '@/components/deals/deal-card'
import { OfferCard } from '@/components/deals/offer-card'
import { countLabel } from '@/lib/format'
import type { StandaloneOffer } from '@/lib/offers'
import { assessDealQuality, dealsForList, type ProductPrice } from '@/lib/prices'
import type { PantryItem } from '@/lib/types'

// The home screen's own small preview of promotions: only what is relevant to the household's
// current shopping list, never the full catalog of today's deals — that unbounded browsing (with its
// own database cost) moved to the dedicated Akce tab (docs/07_CHANGELOG.md, 2026-09-27; the owner's
// own words: too many to scroll through on Domů). `productPrices` is fetched with `runningDeals:
// false` (app/page.tsx), so it only ever holds the list's own products — this widget can never grow
// unbounded, by construction, not just by a UI cutoff.

export function PriceWatch({
  onBrowseDeals,
  onStores,
  onAddToList,
  listItemNames,
  productPrices,
  offers,
  pantryItems,
  today,
}: {
  /** Opens the Akce tab, to browse every promotion by category. */
  onBrowseDeals: () => void
  onStores: () => void
  /** Puts the product on the household's main shopping list. */
  onAddToList: (name: string) => void
  /** Names of the items still to buy, so a product already on the list is not added twice. */
  listItemNames: string[]
  productPrices: ProductPrice[]
  /** Offers with no regular price to compare against: shown as they are, without a discount. */
  offers: StandaloneOffer[]
  pantryItems: PantryItem[]
  /** The real date (`YYYY-MM-DD`) — decides which promotions are still running. */
  today: string
}) {
  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  const isOnList = (name: string) => onList.has(name.trim().toLowerCase())
  // Per docs/05_BUSINESS_RULES.md: a discount isn't automatically a good deal — check whether it's
  // actually the cheapest option for that product, not just cheaper than its own regular price.
  // `dealsForList` keeps only the list's own deals, in the list's order — with `productPrices`
  // already restricted to the list's products, "others" is always empty, but reusing it avoids a
  // second copy of that ordering rule (CLAUDE.md section 6).
  const { onList: listDeals } = dealsForList(assessDealQuality(productPrices, today), listItemNames)
  const listOffers = offers.filter((offer) => isOnList(offer.productName))

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Akce k vašim položkám</p>
          <p className="mt-1 text-sm text-fg-secondary">
            {listDeals.length > 0 ? `${countLabel(listDeals.length, 'akce', 'akce', 'akcí')} na položky z vašeho seznamu` : 'Na vašem seznamu teď nic v akci není.'}
          </p>
        </div>
        <Tag className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
      </div>
      {listDeals.length > 0 && (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {listDeals.map((assessment) => (
            <DealCard
              key={`${assessment.product.productName}-${assessment.price.store}`}
              assessment={assessment}
              isOnList={isOnList(assessment.product.productName)}
              onAddToList={onAddToList}
              pantryItems={pantryItems}
            />
          ))}
        </div>
      )}
      {listOffers.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium">Další nabídky obchodů</p>
          <p className="mt-1 text-xs text-fg-muted">U těchto produktů neznáme běžnou cenu, proto je neporovnáváme a neuvádíme slevu.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {listOffers.map((offer) => (
              <OfferCard key={`${offer.productName}-${offer.store}`} offer={offer} />
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button type="button" onClick={onBrowseDeals} className="min-h-10 rounded-lg text-sm font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Procházet všechny akce <ArrowUpRight className="ml-1 inline size-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onStores} className="min-h-10 rounded-lg text-sm font-medium text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Porovnat všechny obchody <ArrowUpRight className="ml-1 inline size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
