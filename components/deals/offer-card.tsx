import { Check, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { money } from '@/lib/format'
import { offerUnitPriceLabel, shortOfferDate, type StandaloneOffer } from '@/lib/offers'

/** An offer with no regular price to compare against (a retailer that publishes only its current
 *  offers, e.g. Penny — CLAUDE.md sections 15 and 18: no discount is invented for it). Shared by the
 *  home screen and the Akce tab.
 *
 *  The missing regular price is a reason not to judge the price, never a reason to hide the product:
 *  the shopper decides whether it is a good buy, so the offer can be put on the shopping list like any
 *  other (the owner's request, 2026-10-07). The plan then prices it at the offer, since the app now
 *  knows the product from that offer (lib/db/product-search.ts, currentPriceRows()).
 *
 *  `onAddToList` is left out by Domů, which shows only offers for products already on the household's
 *  list — there is nothing to add there, so the row stays a compact one. */
export function OfferCard({ offer, isOnList = false, onAddToList }: { offer: StandaloneOffer; isOnList?: boolean; onAddToList?: (name: string) => void }) {
  return (
    <div className={`rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)] ${isOnList ? 'border-accent-solid' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{offer.productName}</p>
          <p className="mt-1 text-sm text-fg-muted">
            {offer.store} · akce do {shortOfferDate(offer.validUntil)}
          </p>
          {offerUnitPriceLabel(offer) && <p className="mt-0.5 text-sm text-fg-muted">{offerUnitPriceLabel(offer)}</p>}
        </div>
        <span className="shrink-0 text-lg font-semibold">{money(offer.dealPrice)}</span>
      </div>
      {onAddToList && (
        <div className="mt-3 flex justify-end">
          {isOnList ? (
            <Badge tone="success" className="min-h-10">
              <Check className="size-3.5" aria-hidden="true" /> Na seznamu
            </Badge>
          ) : (
            <Button variant="secondary" onClick={() => onAddToList(offer.productName)} aria-label={`Přidat ${offer.productName} na nákupní seznam`}>
              <Plus aria-hidden="true" /> Na seznam
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
