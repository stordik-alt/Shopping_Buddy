import type { ReactNode } from 'react'
import { CheckCircle2, ChevronRight, ListChecks } from 'lucide-react'
import { BudgetHero } from '@/components/budget/budget-hero'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { CardButton, CardHeader } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'

const MAX_PREVIEW_ITEMS = 3

export function DashboardOverview({
  budget,
  spent,
  remaining,
  completed,
  totalItems,
  pendingNames,
  onBudget,
  onShopping,
  onExpense,
  onReceipt,
  onStores,
  onSetBudget,
  afterBudget,
  today,
  periodStartDay = 1,
}: {
  /** The real date (`YYYY-MM-DD`), for the budget card's per-day allowance and pace. */
  today: string
  /** Day of the month the budget period starts on (1 = calendar month). */
  periodStartDay?: number
  budget: number
  spent: number
  remaining: number
  completed: number
  totalItems: number
  /** Names of the items still to buy, in list order — only the first few are previewed. */
  pendingNames: string[]
  /** Opens the budget detail (the whole budget card is the tap target). */
  onBudget: () => void
  onShopping: () => void
  onExpense: () => void
  onReceipt: () => void
  onStores: () => void
  onSetBudget: () => void
  /** Shown right under the budget card (the spending by category, owner 2026-10-05); full width from lg. */
  afterBudget?: ReactNode
}) {
  const pendingCount = Math.max(0, totalItems - completed)
  const preview = pendingNames.slice(0, MAX_PREVIEW_ITEMS)

  return (
    // On a phone the primary reading order is budget → today's shopping → quick actions. On larger
    // screens the shopping card stays beside the budget, while secondary controls span below.
    <section className="min-w-0 w-full grid gap-3 lg:grid-cols-[1.35fr_1fr] lg:gap-4" aria-label="Přehled domácnosti">
      <BudgetHero compact today={today} periodStartDay={periodStartDay} budget={budget} spent={spent} remaining={remaining} onSetBudget={onSetBudget} onOpen={onBudget} className="order-1 min-w-0" />

      <CardButton onClick={onShopping} className="group order-2 flex flex-col lg:order-2">
        <CardHeader as="span" title="Nákupní seznam" icon={<ListChecks className="size-4" />} action={<ChevronRight className="size-5 transition group-hover:translate-x-0.5" />} className="w-full" />
        {totalItems === 0 ? (
          <>
            <span className="mt-4 block text-lg font-semibold">Seznam je zatím prázdný</span>
            <span className="mt-1 block text-sm text-fg-secondary">Přidejte první položku a mějte nákup pod kontrolou.</span>
          </>
        ) : (
          <>
            <span className="mt-3 block text-2xl font-semibold tracking-tight">
              {completed} z {totalItems} <span className="text-base font-medium text-fg-muted">hotovo</span>
            </span>
            <ProgressBar value={completed} max={totalItems} label="Postup nákupu" className="mt-3" />
            {pendingCount === 0 ? (
              <span className="mt-4 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Vše nakoupeno
              </span>
            ) : (
              <span className="mt-3 block space-y-1.5 text-sm">
                {preview.map((name, index) => (
                  <span key={`${name}-${index}`} className="flex items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-accent-solid" aria-hidden="true" />
                    <span className="min-w-0 break-words">{name}</span>
                  </span>
                ))}
                {pendingCount > preview.length && <span className="block pl-3.5 text-xs text-fg-muted">a dalších {pendingCount - preview.length}</span>}
              </span>
            )}
          </>
        )}
      </CardButton>

      {afterBudget && <div className="order-3 min-w-0 w-full lg:order-3 lg:col-span-2">{afterBudget}</div>}

      <QuickActions className="order-4 lg:order-4 lg:col-span-2" onShopping={onShopping} onExpense={onExpense} onReceipt={onReceipt} onStores={onStores} />
    </section>
  )
}
