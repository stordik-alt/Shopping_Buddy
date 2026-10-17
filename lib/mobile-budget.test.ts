import { describe, expect, it } from 'vitest'
import { mobileBudgetSummary } from '@/lib/mobile-budget'
import type { Expense } from '@/lib/types'

const expense = (id: string, amount: number, category: Expense['category'], date: string): Expense => ({
  id,
  amount,
  note: '',
  category,
  subcategory: null,
  date,
  purchaseId: null,
})

describe('mobileBudgetSummary', () => {
  it('uses the configured custom period budget and summarizes only its expenses by category', () => {
    const period = { type: 'custom', anchor: '2026-10-01', lengthDays: 14 } as const
    const summary = mobileBudgetSummary({
      today: '2026-10-10',
      period,
      currency: 'CZK',
      defaultBudget: 5000,
      periodBudgets: { '2026-10-01': 4000 },
      categoryBudgets: { Potraviny: 1500 },
      expenses: [
        expense('current-1', 800, 'Potraviny', '2026-10-02'),
        expense('current-2', 300, 'Drogerie', '2026-10-10'),
        expense('future-period', 900, 'Potraviny', '2026-10-15'),
      ],
    })

    expect(summary).toEqual({
      currency: 'CZK',
      period: { start: '2026-10-01', end: '2026-10-14' },
      budget: 4000,
      spent: 1100,
      remaining: 2900,
      categories: [
        { category: 'Potraviny', total: 800, limit: 1500, level: 'ok' },
        { category: 'Drogerie', total: 300, limit: null, level: 'ok' },
      ],
    })
  })

  it('falls back to the household budget and includes empty categories with configured limits', () => {
    const summary = mobileBudgetSummary({
      today: '2026-10-17',
      period: { type: 'calendar' },
      currency: 'EUR',
      defaultBudget: 250,
      periodBudgets: {},
      categoryBudgets: { Bydlení: 100 },
      expenses: [expense('outside', 80, 'Potraviny', '2026-09-30')],
    })

    expect(summary.budget).toBe(250)
    expect(summary.spent).toBe(0)
    expect(summary.remaining).toBe(250)
    expect(summary.categories).toEqual([{ category: 'Bydlení', total: 0, limit: 100, level: 'ok' }])
  })
})
