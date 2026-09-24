import { describe, expect, it } from 'vitest'
import {
  budgetImpact,
  budgetLevel,
  categoryBreakdown,
  crossedBudgetThreshold,
  dailyAverage,
  monthOverMonthChange,
  MONTH_START,
  plannedSpend,
  PREVIOUS_MONTH_TOTAL,
  projectedMonthEnd,
  totalSpent,
  weeklyAverage,
} from '@/lib/budget'
import type { Expense, Item } from '@/lib/types'

const expense = (amount: number, category: Expense['category'] = 'Potraviny'): Expense => ({
  id: crypto.randomUUID(),
  amount,
  note: '',
  category,
  date: '2026-09-10',
})

const item = (price: number, quantity: number, done = false): Item => ({
  id: crypto.randomUUID(),
  name: 'x',
  detail: '',
  price,
  quantity,
  unit: 'ks',
  category: 'Potraviny',
  done,
  color: '',
  priority: 'Normální',
})

describe('totalSpent', () => {
  it('sums expense amounts', () => {
    expect(totalSpent([expense(100), expense(50.5)])).toBeCloseTo(150.5)
  })

  it('returns 0 for no expenses', () => {
    expect(totalSpent([])).toBe(0)
  })
})

describe('dailyAverage / weeklyAverage / projectedMonthEnd', () => {
  it('divides total spend by days elapsed since the start of the month, inclusive', () => {
    // MONTH_START is 2026-09-01; on the 10th, 10 days have elapsed (1st through 10th).
    const daily = dailyAverage([expense(1000)], '2026-09-10')
    expect(daily).toBeCloseTo(100)
  })

  it('never divides by zero even on the first day of the month', () => {
    const daily = dailyAverage([expense(300)], MONTH_START)
    expect(Number.isFinite(daily)).toBe(true)
    expect(daily).toBeGreaterThan(0)
  })

  it('derives weekly and projected-month-end averages from the same daily rate', () => {
    const expenses = [expense(1000)]
    const daily = dailyAverage(expenses, '2026-09-10')
    expect(weeklyAverage(expenses, '2026-09-10')).toBeCloseTo(daily * 7)
    expect(projectedMonthEnd(expenses, '2026-09-10')).toBeCloseTo(daily * 30)
  })
})

describe('categoryBreakdown', () => {
  it('groups by category and sorts by total descending', () => {
    const breakdown = categoryBreakdown([expense(100, 'Potraviny'), expense(50, 'Drogerie'), expense(200, 'Potraviny')])
    expect(breakdown).toEqual([
      { category: 'Potraviny', total: 300 },
      { category: 'Drogerie', total: 50 },
    ])
  })
})

describe('plannedSpend', () => {
  it('only counts items not yet marked done', () => {
    const items = [item(50, 2, false), item(30, 1, true)]
    expect(plannedSpend(items)).toBe(100)
  })

  it('multiplies price by quantity', () => {
    expect(plannedSpend([item(25, 3)])).toBe(75)
  })
})

describe('monthOverMonthChange', () => {
  it('compares against the fixed previous-month baseline', () => {
    const result = monthOverMonthChange([expense(PREVIOUS_MONTH_TOTAL * 1.1)])
    expect(result.previous).toBe(PREVIOUS_MONTH_TOTAL)
    expect(result.changePercent).toBeCloseTo(10, 0)
  })

  it('reports a negative change when spending less than last month', () => {
    const result = monthOverMonthChange([expense(PREVIOUS_MONTH_TOTAL / 2)])
    expect(result.changePercent).toBeLessThan(0)
  })
})

describe('budgetImpact', () => {
  it('is not over budget when the cost fits within what remains', () => {
    expect(budgetImpact(300, 500).overBudget).toBe(false)
  })

  it('is over budget once the cost exceeds what remains', () => {
    expect(budgetImpact(600, 500).overBudget).toBe(true)
  })

  it('computes what percentage of the remaining budget the cost would use', () => {
    expect(budgetImpact(250, 1000).percentOfRemaining).toBeCloseTo(25)
  })

  it('is always over budget once there is no remaining budget left, regardless of cost', () => {
    expect(budgetImpact(0.01, 0).overBudget).toBe(true)
    expect(budgetImpact(0.01, -50).overBudget).toBe(true)
  })

  it('has no meaningful percentage when there is no positive remaining budget to express one against', () => {
    expect(budgetImpact(100, 0).percentOfRemaining).toBeNull()
    expect(budgetImpact(100, -50).percentOfRemaining).toBeNull()
  })
})

describe('crossedBudgetThreshold', () => {
  it('fires "reached" exactly at the moment spending crosses 80%, not before', () => {
    expect(crossedBudgetThreshold(750, 850, 1000)).toBe('reached')
    expect(crossedBudgetThreshold(600, 700, 1000)).toBeNull()
  })

  it('fires "exceeded" exactly at the moment spending crosses 100%', () => {
    expect(crossedBudgetThreshold(950, 1050, 1000)).toBe('exceeded')
  })

  it('does not re-fire "reached" for a later expense that stays within the same already-crossed band', () => {
    expect(crossedBudgetThreshold(850, 900, 1000)).toBeNull()
  })

  it('does not re-fire "exceeded" for a later expense once already over budget', () => {
    expect(crossedBudgetThreshold(1050, 1150, 1000)).toBeNull()
  })

  it('jumping straight past both thresholds in one expense reports "exceeded", the more severe one', () => {
    expect(crossedBudgetThreshold(500, 1200, 1000)).toBe('exceeded')
  })

  it('is null when there is no positive budget to measure against', () => {
    expect(crossedBudgetThreshold(0, 100, 0)).toBeNull()
  })
})

describe('budgetLevel', () => {
  it('is ok below 80 % of the budget', () => {
    expect(budgetLevel(0, 1000)).toBe('ok')
    expect(budgetLevel(799, 1000)).toBe('ok')
  })

  it('is warning from exactly 80 % up to, but not including, 100 %', () => {
    expect(budgetLevel(800, 1000)).toBe('warning')
    expect(budgetLevel(999, 1000)).toBe('warning')
  })

  it('is over at 100 % and beyond', () => {
    expect(budgetLevel(1000, 1000)).toBe('over')
    expect(budgetLevel(1500, 1000)).toBe('over')
  })

  it('never reports an alarm when there is no positive budget to compare against', () => {
    expect(budgetLevel(500, 0)).toBe('ok')
    expect(budgetLevel(500, -10)).toBe('ok')
  })

  it('agrees with the notification thresholds', () => {
    // The same two boundaries fire the notifications, so a crossing must change the level.
    expect(crossedBudgetThreshold(799, 800, 1000)).toBe('reached')
    expect(budgetLevel(800, 1000)).toBe('warning')
    expect(crossedBudgetThreshold(999, 1000, 1000)).toBe('exceeded')
    expect(budgetLevel(1000, 1000)).toBe('over')
  })
})
