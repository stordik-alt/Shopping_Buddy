import { ChevronRight, CircleDollarSign, ListChecks, Sparkles, Wallet, ArrowUpRight } from 'lucide-react'

const EXPENSE_CATEGORIES: [string, number][] = [
  ['Bydlení', 78],
  ['Jídlo', 58],
  ['Děti', 42],
  ['Doprava', 30],
  ['Ostatní', 20],
]

export function DashboardOverview({
  budget,
  spent,
  remaining,
  completed,
  totalItems,
  onShopping,
  onExpense,
}: {
  budget: number
  spent: number
  remaining: number
  completed: number
  totalItems: number
  onShopping: () => void
  onExpense: () => void
}) {
  const spentPercent = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-3xl bg-primary p-6 text-primary-foreground sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm opacity-70">Rozpočet domácnosti</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight">{budget.toLocaleString('cs-CZ')} Kč</p>
            </div>
            <CircleDollarSign className="h-6 w-6 shrink-0 opacity-60" aria-hidden="true" />
          </div>
          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs opacity-60">Utraceno tento měsíc</p>
              <p className="mt-1 font-medium">{spent.toLocaleString('cs-CZ')} Kč</p>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-60">Zbývá</p>
              <p className="mt-1 font-medium">{remaining.toLocaleString('cs-CZ')} Kč</p>
            </div>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/20"
            role="progressbar"
            aria-label="Čerpání rozpočtu"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={spentPercent}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${spentPercent}%` }} />
          </div>
        </div>

        <button
          onClick={onShopping}
          className="group rounded-3xl border border-border bg-card p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-8"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1" aria-hidden="true" />
          </div>
          <p className="mt-7 text-sm text-muted-foreground">Týdenní nákup</p>
          <p className="mt-1 text-2xl font-semibold">{completed} z {totalItems} hotovo</p>
          <p className="mt-2 text-xs text-muted-foreground">Ještě zbývá {Math.max(0, totalItems - completed)} položek</p>
        </button>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-border bg-card p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Výdaje podle kategorií</p>
              <p className="mt-1 text-xs text-muted-foreground">Září 2026</p>
            </div>
            <button className="min-h-10 shrink-0 rounded-lg px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Podrobnosti
            </button>
          </div>
          <div className="mt-7 flex items-end gap-2" style={{ height: 150 }}>
            {EXPENSE_CATEGORIES.map(([label, height]) => (
              <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-[120px] w-full items-end">
                  <div className="w-full rounded-t-lg bg-primary/80" style={{ height: `${height}%` }} />
                </div>
                <span className="w-full text-center text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-accent p-6 text-accent-foreground sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" /> Tip od AI
              </div>
              <p className="mt-5 max-w-sm text-xl font-semibold leading-snug">
                V Albertu je tento týden kuřecí maso o 20 % levnější.
              </p>
              <p className="mt-3 text-sm opacity-70">Na vašem seznamu byste mohli ušetřit až 45 Kč.</p>
            </div>
            <button
              onClick={onShopping}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-foreground text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Zobrazit doporučení"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <button onClick={onShopping} className="mt-8 min-h-10 rounded-lg px-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Zobrazit nabídku
          </button>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Přidat výdaj</p>
            <p className="text-xs text-muted-foreground">Zapište dnešní nákup</p>
          </div>
        </div>
        <button onClick={onExpense} className="min-h-10 shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          + Nový výdaj
        </button>
      </section>
    </div>
  )
}
