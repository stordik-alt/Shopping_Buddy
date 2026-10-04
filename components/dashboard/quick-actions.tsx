import { MapPin, Plus, ReceiptText, WalletCards } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The four things a household does most often, one tap from the home screen, as one compact row
 * of icons. It uses the ANITKA semantic icon system without changing the interaction model. */
export function QuickActions({
  onShopping,
  onExpense,
  onReceipt,
  onStores,
  className = '',
}: {
  onShopping: () => void
  onExpense: () => void
  onReceipt: () => void
  onStores: () => void
  className?: string
}) {
  const actions = [
    { label: 'Do nákupu', name: 'Přidat do nákupu', icon: Plus, onClick: onShopping },
    { label: 'Výdaj', name: 'Zapsat výdaj', icon: WalletCards, onClick: onExpense },
    { label: 'Účtenka', name: 'Nahrát účtenku', icon: ReceiptText, onClick: onReceipt },
    { label: 'Obchody', name: 'Najít obchod', icon: MapPin, onClick: onStores },
  ]
  return (
    <section className={cn('grid grid-cols-4 gap-1.5 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-card)]', className)} aria-label="Rychlé akce">
      {actions.map(({ label, name, icon: Icon, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-label={name}
          className="group flex min-h-16 flex-col items-center justify-center gap-2 rounded-xl px-1 py-2.5 text-center transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent-text transition group-hover:bg-accent-solid group-hover:text-accent-solid-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="text-xs font-medium leading-tight">{label}</span>
        </button>
      ))}
    </section>
  )
}
