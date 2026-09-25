import { MapPin, Plus, ReceiptText, Wallet } from 'lucide-react'

/** The four things a household does most often, one tap from the home screen, as one compact row
 *  of icons. It used to be four large tiles in a 2 × 2 grid, which on a phone took most of the first
 *  screen and pushed the shopping list and the deals below it. The visible labels are short; the
 *  accessible name says what the button does. */
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
    { label: 'Výdaj', name: 'Zapsat výdaj', icon: Wallet, onClick: onExpense },
    { label: 'Účtenka', name: 'Nahrát účtenku', icon: ReceiptText, onClick: onReceipt },
    { label: 'Obchody', name: 'Najít obchod', icon: MapPin, onClick: onStores },
  ]
  return (
    <section className={`surface grid grid-cols-4 gap-1 p-2 ${className}`} aria-label="Rychlé akce">
      {actions.map(({ label, name, icon: Icon, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          aria-label={name}
          className="group flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 text-center transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-xs font-medium leading-tight">{label}</span>
        </button>
      ))}
    </section>
  )
}
