import { describe, expect, it } from 'vitest'
import {
  budgetImpact,
  budgetLevel,
  categoryBreakdown,
  crossedBudgetThreshold,
  dailyAverage,
  daysInMonth,
  expensesInMonth,
  monthOverMonthChange,
  plannedSpend,
  previousMonthKey,
  projectedMonthEnd,
  totalSpent,
  weeklyAverage,
} from '@/lib/budget'
import type { Expense, Item } from '@/lib/types'

const expense = (amount: number, category: Expense['category'] = 'Potraviny', date = '2026-09-10'): Expense => ({
  id: crypto.randomUUID(),
  amount,
  note: '',
  category,
  date,
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

describe('month helpers', () => {
  it('knows how long each month is, including February in leap years', () => {
    expect(daysInMonth('2026-09-25')).toBe(30)
    expect(daysInMonth('2026-10-01')).toBe(31)
    expect(daysInMonth('2026-02-10')).toBe(28)
    expect(daysInMonth('2028-02-10')).toBe(29)
  })

  it('finds the previous month, across a year boundary too', () => {
    expect(previousMonthKey('2026-09-25')).toBe('2026-08')
    expect(previousMonthKey('2027-01-03')).toBe('2026-12')
  })

  it('keeps only the expenses of the month today falls in', () => {
    const expenses = [expense(1, 'Potraviny', '2026-08-31'), expense(2, 'Potraviny', '2026-09-01'), expense(3, 'Potraviny', '2026-09-30'), expense(4, 'Potraviny', '2025-09-15')]
    expect(expensesInMonth(expenses, '2026-09-25').map((e) => e.amount)).toEqual([2, 3])
  })
})

describe('dailyAverage / weeklyAverage / projectedMonthEnd', () => {
  it("divides this month's spend by the days elapsed since the 1st, inclusive", () => {
    // On the 10th, 10 days have elapsed (1st through 10th).
    expect(dailyAverage([expense(1000)], '2026-09-10')).toBeCloseTo(100)
  })

  it('ignores expenses of other months', () => {
    expect(dailyAverage([expense(1000), expense(5000, 'Potraviny', '2026-08-20')], '2026-09-10')).toBeCloseTo(100)
  })

  it('never divides by zero on the first day of the month', () => {
    const daily = dailyAverage([expense(300, 'Potraviny', '2026-09-01')], '2026-09-01')
    expect(daily).toBe(300)
  })

  it("derives weekly and month-end figures from the same daily rate and the month's real length", () => {
    const expenses = [expense(1000)]
    const daily = dailyAverage(expenses, '2026-09-10')
    expect(weeklyAverage(expenses, '2026-09-10')).toBeCloseTo(daily * 7)
    expect(projectedMonthEnd(expenses, '2026-09-10')).toBeCloseTo(daily * 30)
    // October has 31 days.
    expect(projectedMonthEnd([expense(310, 'Potraviny', '2026-10-10')], '2026-10-10')).toBeCloseTo(961)
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
  it('compares this month so far with the same days of the previous month', () => {
    const expenses = [
      expense(1100, 'Potraviny', '2026-09-05'),
      expense(1000, 'Potraviny', '2026-08-03'),
      // After the 10th of August: not part of "the same days", so not compared.
      expense(9000, 'Potraviny', '2026-08-25'),
    ]
    const result = monthOverMonthChange(expenses, '2026-09-10')
    expect(result).toMatchObject({ current: 1100, previous: 1000 })
    expect(result?.changePercent).toBeCloseTo(10, 5)
  })

  it('reports a negative change when spending less than last month', () => {
    const result = monthOverMonthChange([expense(500, 'Potraviny', '2026-09-02'), expense(1000, 'Potraviny', '2026-08-02')], '2026-09-10')
    expect(result?.changePercent).toBeLessThan(0)
  })

  it('compares the 31st with the whole of a shorter previous month', () => {
    const result = monthOverMonthChange([expense(100, 'Potraviny', '2026-03-31'), expense(200, 'Potraviny', '2026-02-28')], '2026-03-31')
    expect(result?.previous).toBe(200)
  })

  it('has no comparison when the previous month has no expenses, rather than an invented baseline', () => {
    expect(monthOverMonthChange([expense(500)], '2026-09-10')).toBeNull()
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
