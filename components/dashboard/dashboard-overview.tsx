import { ArrowRight, CheckCircle2, ListChecks } from 'lucide-react'
import { BudgetHero } from '@/components/budget/budget-hero'
import { QuickActions } from '@/components/dashboard/quick-actions'

const MAX_PREVIEW_ITEMS = 3

export function DashboardOverview({
  budget,
  spent,
  remaining,
  completed,
  totalItems,
  pendingNames,
  onShopping,
  onExpense,
  onReceipt,
  onStores,
  onSetBudget,
}: {
  budget: number
  spent: number
  remaining: number
  completed: number
  totalItems: number
  /** Names of the items still to buy, in list order — only the first few are previewed. */
  pendingNames: string[]
  onShopping: () => void
  onExpense: () => void
  onReceipt: () => void
  onStores: () => void
  onSetBudget: () => void
}) {
  const shoppingPercent = totalItems > 0 ? Math.round((completed / totalItems) * 100) : 0
  const pendingCount = Math.max(0, totalItems - completed)
  const preview = pendingNames.slice(0, MAX_PREVIEW_ITEMS)

  return (
    // On a phone the order is budget → quick actions → shopping list, so the everyday actions are
    // visible without scrolling; from lg up the list sits beside the budget and actions span below.
    <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]" aria-label="Přehled domácnosti">
      <BudgetHero budget={budget} spent={spent} remaining={remaining} onSetBudget={onSetBudget} className="order-1" />

      <QuickActions className="order-2 lg:order-3 lg:col-span-2" onShopping={onShopping} onExpense={onExpense} onReceipt={onReceipt} onStores={onStores} />

      <button
        onClick={onShopping}
        className="surface group order-3 flex flex-col p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6 lg:order-2"
      >
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" /> Nákupní seznam
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" aria-hidden="true" />
        </div>
        {totalItems === 0 ? (
          <>
            <p className="mt-4 text-lg font-semibold">Seznam je zatím prázdný</p>
            <p className="mt-1 text-sm text-muted-foreground">Přidejte první položku a mějte nákup pod kontrolou.</p>
          </>
        ) : (
          <>
            <p className="mt-4 text-2xl font-semibold tracking-tight">
              {completed} z {totalItems} <span className="text-base font-medium text-muted-foreground">hotovo</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Postup nákupu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shoppingPercent}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${shoppingPercent}%` }} />
            </div>
            {pendingCount === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Vše nakoupeno
              </p>
            ) : (
              <ul className="mt-4 space-y-1.5 text-sm">
                {preview.map((name, index) => (
                  <li key={`${name}-${index}`} className="flex items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden="true" />
                    <span className="min-w-0 break-words">{name}</span>
                  </li>
                ))}
                {pendingCount > preview.length && <li className="pl-3.5 text-xs text-muted-foreground">a dalších {pendingCount - preview.length}</li>}
              </ul>
            )}
          </>
        )}
      </button>
    </section>
  )
}
