import { Tag } from 'lucide-react'
import { money, shortDate } from '@/lib/format'
import { offerUnitPriceLabel, shortOfferDate, type StandaloneOffer } from '@/lib/offers'
import { comparePrices, effectivePrice, isDealActive, previousPrice, type ProductPrice } from '@/lib/prices'
import { PriceSparkline } from '@/components/shopping/price-sparkline'

/** What the app knows about one list item's product: the prices recorded per chain (compared, cheapest
 *  first) and, separately, the running offers of chains it has no regular price for (`lib/offers.ts`).
 *  The two are never mixed: an offer has no regular price, so it states no discount and no "cheaper
 *  than" — it is listed as it is, which is also what the Akce tab does (CLAUDE.md sections 15 and 18).
 *  Before 2026-10-07 such a product showed nothing here at all. */
export function PriceComparison({
  productName,
  productPrices,
  offers = [],
  today,
}: {
  productName: string
  productPrices: ProductPrice[]
  /** The running offers for this product (`offersForProduct()`), cheapest first. */
  offers?: StandaloneOffer[]
  today: string
}) {
  const product = comparePrices(productPrices, productName)
  if (!product && offers.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      {product && (
        <>
          <p className="font-medium">Porovnání cen mezi obchody</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {product.prices.map((price, index) => {
              // The price before the last change, with the dates it was recorded and replaced — the
              // current price is always the latest observation, older ones stay visible as old prices.
              const old = previousPrice(price)
              return (
                <div
                  key={price.store}
                  className={`rounded-lg px-2 py-1.5 ${index === 0 ? 'bg-accent-subtle text-accent-text' : 'bg-muted text-foreground'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{price.store}</span>
                    <span className="flex flex-wrap items-center justify-end gap-x-2">
                      {isDealActive(price, today) && (
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          <Tag className="h-3 w-3" /> akce do {shortDate(price.dealValidUntil ?? '')}
                        </span>
                      )}
                      <span className="font-semibold">{money(effectivePrice(price))}</span>
                      <span className="text-muted-foreground">
                        ({money(price.unitPrice)}/{price.unit})
                      </span>
                    </span>
                  </div>
                  {old && (
                    <p className="mt-1 text-xs leading-snug text-muted-foreground" data-testid="old-price">
                      Dříve {money(old.price)} · zaznamenáno {shortDate(old.recordedAt)}
                      {old.validUntil ? `, změna ${shortDate(old.validUntil)}` : ''}
                    </p>
                  )}
                  <PriceSparkline point={price} today={today} />
                </div>
              )
            })}
          </div>
        </>
      )}
      {offers.length > 0 && (
        <div className={product ? 'mt-2 border-t border-border pt-2' : undefined}>
          <p className="font-medium">Akce bez běžné ceny</p>
          <p className="mt-0.5 text-muted-foreground">Běžnou cenu u nich neznáme, proto je neporovnáváme a neuvádíme slevu.</p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {offers.map((offer) => (
              <div key={offer.storeId} className="flex items-center justify-between gap-2 rounded-lg bg-muted px-2 py-1.5 text-foreground">
                <span className="font-medium">{offer.store}</span>
                <span className="flex flex-wrap items-center justify-end gap-x-2">
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <Tag className="h-3 w-3" aria-hidden="true" /> akce do {shortOfferDate(offer.validUntil)}
                  </span>
                  <span className="font-semibold">{money(offer.dealPrice)}</span>
                  {offerUnitPriceLabel(offer) && <span className="text-muted-foreground">({offerUnitPriceLabel(offer)})</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
