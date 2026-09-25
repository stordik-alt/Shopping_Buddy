import { useState } from 'react'
import { ArrowUpRight, Check, ChevronDown, Info, Package, Plus, Tag, TrendingDown } from 'lucide-react'
import { countLabel, money, shortDate } from '@/lib/format'
import { offerUnitPriceLabel, shortOfferDate, type StandaloneOffer } from '@/lib/offers'
import { pantryQuantityFor } from '@/lib/pantry'
import { assessDealQuality, dealDiscount, dealsForList, suggestsStockingUp, type ProductPrice } from '@/lib/prices'
import type { PantryItem } from '@/lib/types'

// How many cards the home screen shows before "Zobrazit všechny": enough to act on, few enough
// that the rest of the home screen stays in reach.
const COLLAPSED_CARDS = 3

export function PriceWatch({
  today,
  onStores,
  onAddToList,
  listItemNames,
  productPrices,
  offers,
  pantryItems,
}: {
  /** The real date (`YYYY-MM-DD`) — decides which promotions are still running. */
  today: string
  onStores: () => void
  /** Puts the product on the household's main shopping list. */
  onAddToList: (name: string) => void
  /** Names of the items still to buy, so a product already on the list is not added twice. */
  listItemNames: string[]
  productPrices: ProductPrice[]
  /** Offers with no regular price to compare against: shown as they are, without a discount. */
  offers: StandaloneOffer[]
  pantryItems: PantryItem[]
}) {
  // Per docs/05_BUSINESS_RULES.md: a discount isn't automatically a good deal — check whether
  // it's actually the cheapest option for that product, not just cheaper than its own regular price.
  const deals = assessDealQuality(productPrices, today)
  const onList = new Set(listItemNames.map((name) => name.trim().toLowerCase()))
  const isOnList = (name: string) => onList.has(name.trim().toLowerCase())
  // Deals for what the household is about to buy come first; the rest by discount.
  const { onList: listDeals, others } = dealsForList(deals, listItemNames)
  const orderedDeals = [...listDeals, ...others]
  const [showAll, setShowAll] = useState(false)
  // Collapsed, the first cards are deals (list ones first) and any free slots go to offers without
  // a regular price; expanded, everything is shown.
  const shownDeals = showAll ? orderedDeals : orderedDeals.slice(0, COLLAPSED_CARDS)
  const shownOffers = showAll ? offers : offers.slice(0, Math.max(0, COLLAPSED_CARDS - shownDeals.length))
  const hiddenCount = orderedDeals.length + offers.length - shownDeals.length - shownOffers.length

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Akce</p>
          {orderedDeals.length + offers.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {listDeals.length > 0
                ? `${countLabel(listDeals.length, 'akce', 'akce', 'akcí')} na položky z vašeho seznamu`
                : 'Na vašem seznamu teď nic v akci není. Tady jsou nejvýhodnější akce v obchodech.'}
            </p>
          )}
        </div>
        <Tag className="text-primary" />
      </div>
      {deals.length === 0 && offers.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Momentálně nemáme žádné aktivní akce.</p>
      ) : (
      <>
      {shownDeals.length > 0 && (
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {shownDeals.map(({ product, price, isBestPrice, cheapestAlternative, isHistoricLow }) => {
          const discount = Math.round(dealDiscount(price) * 100)
          return (
            <div
              key={`${product.productName}-${price.store}`}
              className={`rounded-2xl bg-muted p-4 ${isOnList(product.productName) ? 'ring-1 ring-primary/40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{product.productName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{price.store} · akce do {shortDate(price.dealValidUntil ?? '')}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary">-{discount} %</span>
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <span className="text-lg font-semibold">{money(price.dealPrice ?? price.regularPrice)}</span>
                  <span className="ml-2 text-xs text-muted-foreground line-through">{money(price.regularPrice)}</span>
                </div>
                {isOnList(product.productName) ? (
                  <span className="flex min-h-9 items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Check className="h-3.5 w-3.5" /> Na seznamu
                  </span>
                ) : (
                  <button
                    onClick={() => onAddToList(product.productName)}
                    aria-label={`Přidat ${product.productName} na nákupní seznam`}
                    className="flex min-h-9 items-center gap-1 rounded-full bg-card px-3 text-xs font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Na seznam
                  </button>
                )}
              </div>
              {isHistoricLow && (
                <p className="mt-3 flex items-start gap-1 text-[11px] leading-relaxed text-success">
                  <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
                  Nejnižší zaznamenaná cena tohoto produktu v {price.store}.
                </p>
              )}
              {suggestsStockingUp({ product, price, isBestPrice, cheapestAlternative, isHistoricLow }, pantryQuantityFor(pantryItems, product.productName)) && (
                <p className="mt-3 flex items-start gap-1 text-[11px] leading-relaxed text-success">
                  <Package className="mt-0.5 h-3 w-3 shrink-0" />
                  Doma toho máte málo nebo nic — dobrá chvíle doplnit zásoby.
                </p>
              )}
              {!isBestPrice && cheapestAlternative && (
                <p className="mt-3 flex items-start gap-1 text-[11px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Levněji je i bez akce v {cheapestAlternative.store} za {money(cheapestAlternative.price)}.
                </p>
              )}
            </div>
          )
        })}
      </div>
      )}
      {shownOffers.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium">Další nabídky obchodů</p>
          <p className="mt-1 text-xs text-muted-foreground">U těchto produktů neznáme běžnou cenu, proto je neporovnáváme a neuvádíme slevu.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {shownOffers.map((offer) => (
              <div key={`${offer.productName}-${offer.store}`} className="rounded-2xl bg-muted p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{offer.productName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{offer.store} · akce do {shortOfferDate(offer.validUntil)}</p>
                    {offerUnitPriceLabel(offer) && <p className="mt-0.5 text-xs text-muted-foreground">{offerUnitPriceLabel(offer)}</p>}
                  </div>
                  <span className="shrink-0 text-lg font-semibold">{money(offer.dealPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {(hiddenCount > 0 || showAll) && (
          <button
            onClick={() => setShowAll((current) => !current)}
            aria-expanded={showAll}
            className="flex min-h-10 items-center gap-1 rounded-full bg-muted px-4 text-sm font-medium text-foreground transition hover:bg-primary/10"
          >
            {showAll ? 'Zobrazit méně' : `Zobrazit všechny akce (+${hiddenCount})`}
            <ChevronDown className={`h-4 w-4 transition ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
        <button onClick={onStores} className="min-h-10 text-sm font-medium text-primary">
          Porovnat všechny obchody <ArrowUpRight className="ml-1 inline h-4 w-4" />
        </button>
      </div>
    </section>
  )
}
