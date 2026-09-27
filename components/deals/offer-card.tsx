import { money } from '@/lib/format'
import { offerUnitPriceLabel, shortOfferDate, type StandaloneOffer } from '@/lib/offers'

/** An offer with no regular price to compare against (a retailer that publishes only its current
 *  offers, e.g. Penny — CLAUDE.md sections 15 and 18: no discount is invented for it). Shared by the
 *  home screen and the Akce tab. */
export function OfferCard({ offer }: { offer: StandaloneOffer }) {
  return (
    <div className="rounded-2xl bg-muted p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{offer.productName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {offer.store} · akce do {shortOfferDate(offer.validUntil)}
          </p>
          {offerUnitPriceLabel(offer) && <p className="mt-0.5 text-xs text-muted-foreground">{offerUnitPriceLabel(offer)}</p>}
        </div>
        <span className="shrink-0 text-lg font-semibold">{money(offer.dealPrice)}</span>
      </div>
    </div>
  )
}
