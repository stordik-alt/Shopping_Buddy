import { useState } from 'react'
import { ArrowUpRight, Info, Package, Tag, TrendingDown } from 'lucide-react'
import { TODAY } from '@/lib/budget'
import { money } from '@/lib/format'
import { pantryQuantityFor } from '@/lib/pantry'
import { assessDealQuality, suggestsStockingUp, type ProductPrice } from '@/lib/prices'
import type { PantryItem } from '@/lib/types'

export function PriceWatch({ onStores, productPrices, pantryItems }: { onStores: () => void; productPrices: ProductPrice[]; pantryItems: PantryItem[] }) {
  const [saved, setSaved] = useState<string[]>([])
  // Per docs/05_BUSINESS_RULES.md: a discount isn't automatically a good deal — check whether
  // it's actually the cheapest option for that product, not just cheaper than its own regular price.
  const deals = assessDealQuality(productPrices, TODAY)
  const toggleSaved = (name: string) =>
    setSaved((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Akce pro váš seznam</p>
          <p className="mt-1 text-sm text-muted-foreground">Aktuální ceny, které mohou snížit váš nákup.</p>
        </div>
        <Tag className="text-primary" />
      </div>
      {deals.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">Momentálně nemáme žádné aktivní akce.</p>
      ) : (
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {deals.map(({ product, price, isBestPrice, cheapestAlternative, isHistoricLow }) => {
          const discount = Math.round((1 - (price.dealPrice ?? price.regularPrice) / price.regularPrice) * 100)
          return (
            <div key={`${product.productName}-${price.store}`} className="rounded-2xl bg-muted p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{product.productName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{price.store} · platí do {price.dealValidUntil}</p>
                </div>
                <span className="rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary">-{discount} %</span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <span className="text-lg font-semibold">{money(price.dealPrice ?? price.regularPrice)}</span>
                  <span className="ml-2 text-xs text-muted-foreground line-through">{money(price.regularPrice)}</span>
                </div>
                <button
                  onClick={() => toggleSaved(product.productName)}
                  aria-label={`${saved.includes(product.productName) ? 'Odebrat' : 'Přidat'} ${product.productName}`}
                  className="text-xs font-medium text-primary"
                >
                  {saved.includes(product.productName) ? 'Přidáno' : 'Přidat'}
                </button>
              </div>
              {isHistoricLow && (
                <p className="mt-3 flex items-start gap-1 text-[11px] leading-relaxed text-emerald-700">
                  <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
                  Nejnižší zaznamenaná cena tohoto produktu v {price.store}.
                </p>
              )}
              {suggestsStockingUp({ product, price, isBestPrice, cheapestAlternative, isHistoricLow }, pantryQuantityFor(pantryItems, product.productName)) && (
                <p className="mt-3 flex items-start gap-1 text-[11px] leading-relaxed text-emerald-700">
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
      <button onClick={onStores} className="mt-4 text-sm font-medium text-primary">
        Porovnat všechny obchody <ArrowUpRight className="ml-1 inline h-4 w-4" />
      </button>
    </section>
  )
}
