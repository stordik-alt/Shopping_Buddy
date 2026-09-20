import { CircleDollarSign, Tag, TrendingDown, Wallet } from 'lucide-react'
import { Stat } from '@/components/shared/stat'

const CATEGORIES: [string, number, string][] = [
  ['Bydlení', 4200, 'bg-primary'],
  ['Energie', 1650, 'bg-[#c9b8ef]'],
  ['Potraviny', 3150, 'bg-[#f4b183]'],
  ['Drogerie', 620, 'bg-[#b9d8f5]'],
  ['Děti', 1200, 'bg-[#d7f36b]'],
  ['Doprava', 800, 'bg-[#f6d38b]'],
  ['Oblečení', 450, 'bg-[#f3c0d3]'],
  ['Domácnost', 380, 'bg-[#9ed9c5]'],
  ['Zábava', 300, 'bg-[#d7c4f1]'],
  ['Ostatní', 250, 'bg-[#d7dde3]'],
]

export function BudgetOverview({
  budget,
  setBudget,
  spent,
  onExpense,
}: {
  budget: number
  setBudget: (v: number) => void
  spent: number
  onExpense: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Září 2026</p>
          <h2 className="mt-1 text-2xl font-semibold">Rozpočet domácnosti</h2>
        </div>
        <button onClick={onExpense} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
          + Přidat výdaj
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Celkem" value={`${budget.toLocaleString('cs-CZ')} Kč`} icon={<Wallet />} />
        <Stat label="Utraceno" value={`${spent.toLocaleString('cs-CZ')} Kč`} icon={<TrendingDown />} />
        <Stat label="Zbývá" value={`${(budget - spent).toLocaleString('cs-CZ')} Kč`} icon={<CircleDollarSign />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="flex justify-between">
            <p className="font-semibold">Rozdělení rozpočtu</p>
            <button onClick={() => setBudget(budget === 12000 ? 14000 : 12000)} className="text-xs text-primary">
              Upravit limit
            </button>
          </div>
          <div className="mt-6 space-y-5">
            {CATEGORIES.map(([name, value, color]) => (
              <div key={name}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{name}</span>
                  <span className="font-medium">{value.toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min((value / budget) * 100 * 2.2, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-[#f4b183] p-6 text-[#5b321f]">
          <Tag className="h-5 w-5" />
          <p className="mt-8 text-2xl font-semibold">Akce vám tento měsíc ušetřily 380 Kč.</p>
          <p className="mt-3 text-sm opacity-70">Nejvíce na potravinách a drogerii.</p>
        </div>
      </div>
    </div>
  )
}
