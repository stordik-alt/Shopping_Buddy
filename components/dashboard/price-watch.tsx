import { useState } from 'react'
import { ArrowUpRight, Tag } from 'lucide-react'

const DEALS = [
  { name: 'Mléko polotučné', store: 'Lidl', price: '29,90 Kč', oldPrice: '39,90 Kč', discount: '-25 %' },
  { name: 'Kuřecí prsa', store: 'Albert', price: '79,90 Kč', oldPrice: '99,90 Kč', discount: '-20 %' },
  { name: 'Toaletní papír 8 ks', store: 'Kaufland', price: '64,90 Kč', oldPrice: '79,90 Kč', discount: '-19 %' },
]

export function PriceWatch({ onStores }: { onStores: () => void }) {
  const [saved, setSaved] = useState<string[]>([])
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
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {DEALS.map((deal) => (
          <div key={deal.name} className="rounded-2xl bg-muted p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{deal.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{deal.store}</p>
              </div>
              <span className="rounded-full bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary">{deal.discount}</span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <span className="text-lg font-semibold">{deal.price}</span>
                <span className="ml-2 text-xs text-muted-foreground line-through">{deal.oldPrice}</span>
              </div>
              <button
                onClick={() => toggleSaved(deal.name)}
                aria-label={`${saved.includes(deal.name) ? 'Odebrat' : 'Přidat'} ${deal.name}`}
                className="text-xs font-medium text-primary"
              >
                {saved.includes(deal.name) ? 'Přidáno' : 'Přidat'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onStores} className="mt-4 text-sm font-medium text-primary">
        Porovnat všechny obchody <ArrowUpRight className="ml-1 inline h-4 w-4" />
      </button>
    </section>
  )
}
