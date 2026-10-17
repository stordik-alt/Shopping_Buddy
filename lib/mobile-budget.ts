import { budgetForPeriod, categoryRows, periodEnd, periodStart, periodSummary } from '@/lib/budget'
import type { PeriodConfig } from '@/lib/budget-period'
import type { Expense, CategoryBudgets } from '@/lib/types'

export type MobileBudgetSummary = {
  currency: string
  period: { start: string; end: string }
  budget: number
  spent: number
  remaining: number
  categories: {
    category: string
    total: number
    limit: number | null
    level: 'ok' | 'warning' | 'over'
  }[]
}

/** Shapes the current period for mobile while keeping period and category calculations in lib/budget. */
export function mobileBudgetSummary(input: {
  today: string
  period: PeriodConfig
  currency: string
  defaultBudget: number
  periodBudgets: Readonly<Record<string, number>>
  categoryBudgets: CategoryBudgets
  expenses: Expense[]
}): MobileBudgetSummary {
  const start = periodStart(input.today, input.period)
  const summary = periodSummary(input.expenses, start, input.period)
  const budget = budgetForPeriod(start, input.periodBudgets, input.defaultBudget)

  return {
    currency: input.currency,
    period: { start, end: periodEnd(start, input.period) },
    budget,
    spent: summary.total,
    remaining: budget - summary.total,
    categories: categoryRows(summary, input.categoryBudgets).map(({ category, total, limit, level }) => ({
      category,
      total,
      limit,
      level,
    })),
  }
}
