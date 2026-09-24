import { Plus, ReceiptText, Tag, Wallet } from 'lucide-react'

/** The four things a household does most often, one tap from the home screen. Two columns on a
 *  phone (each tile stays a comfortable tap target with room for a wrapping label), four from sm. */
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
    { label: 'Přidat do nákupu', icon: Plus, onClick: onShopping },
    { label: 'Zapsat výdaj', icon: Wallet, onClick: onExpense },
    { label: 'Nahrát účtenku', icon: ReceiptText, onClick: onReceipt },
    { label: 'Najít akce', icon: Tag, onClick: onStores },
  ]
  return (
    <section className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${className}`} aria-label="Rychlé akce">
      {actions.map(({ label, icon: Icon, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className="surface group flex min-h-24 flex-col items-start justify-between gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold leading-snug">{label}</span>
        </button>
      ))}
    </section>
  )
}
