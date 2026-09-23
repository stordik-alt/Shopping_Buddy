import { Wallet } from 'lucide-react'
import type { Expense } from '@/lib/types'

export function ExpenseHistory({ expenses }: { expenses: Expense[] }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Poslední výdaje</p>
          <p className="mt-1 text-sm text-muted-foreground">Přehled zadaných výdajů domácnosti.</p>
        </div>
        <span className="min-h-10 rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary">{expenses.length} záznamy</span>
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {expenses.slice().reverse().map((expense) => (
          <div key={expense.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
                <Wallet aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{expense.note || 'Výdaj domácnosti'}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{expense.date}</span>
                  <span className="max-w-full rounded-full bg-background px-2 py-0.5 font-medium break-words">{expense.category}</span>
                </span>
              </span>
            </div>
            <span className="shrink-0 text-right text-sm font-semibold">{expense.amount.toLocaleString('cs-CZ')} Kč</span>
          </div>
        ))}
      </div>
    </section>
  )
}
