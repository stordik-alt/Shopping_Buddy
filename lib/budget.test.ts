import { describe, expect, it } from 'vitest'
import {
  budgetImpact,
  budgetPace,
  PACE_MIN_DAYS,
  budgetLevel,
  categoryBreakdown,
  crossedBudgetThreshold,
  dailyAverage,
  expensesInPeriod,
  periodOverPeriodChange,
  plannedSpend,
  isValidPeriodStartDay,
  nextPeriodStart,
  periodDay,
  periodEnd,
  periodLength,
  periodStart,
  previousPeriodStart,
  categoryRows,
  expensePeriods,
  budgetForPeriod,
  periodSavings,
  savingsHistory,
  spendingByPeriod,
  groupExpensesByPurchase,
  subcategoryGroups,
  periodSummary,
  projectedPeriodEnd,
  totalSpent,
  weeklyAllowance,
  weeklyAverage,
} from '@/lib/budget'
import type { Expense, Item } from '@/lib/types'

const expense = (amount: number, category: Expense['category'] = 'Potraviny', date = '2026-09-10'): Expense => ({
  id: crypto.randomUUID(),
  amount,
  note: '',
  category,
  subcategory: null,
  date,
  purchaseId: null,
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
    expect(periodLength('2026-09-25')).toBe(30)
    expect(periodLength('2026-10-01')).toBe(31)
    expect(periodLength('2026-02-10')).toBe(28)
    expect(periodLength('2028-02-10')).toBe(29)
  })

  it('finds the previous month, across a year boundary too', () => {
    expect(previousPeriodStart('2026-09-25')).toBe('2026-08-01')
    expect(previousPeriodStart('2027-01-03')).toBe('2026-12-01')
  })

  it('keeps only the expenses of the month today falls in', () => {
    const expenses = [expense(1, 'Potraviny', '2026-08-31'), expense(2, 'Potraviny', '2026-09-01'), expense(3, 'Potraviny', '2026-09-30'), expense(4, 'Potraviny', '2025-09-15')]
    expect(expensesInPeriod(expenses, '2026-09-25').map((e) => e.amount)).toEqual([2, 3])
  })
})

describe('dailyAverage / weeklyAverage / projectedPeriodEnd', () => {
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
    expect(projectedPeriodEnd(expenses, '2026-09-10')).toBeCloseTo(daily * 30)
    // October has 31 days.
    expect(projectedPeriodEnd([expense(310, 'Potraviny', '2026-10-10')], '2026-10-10')).toBeCloseTo(961)
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

describe('periodOverPeriodChange', () => {
  it('compares this month so far with the same days of the previous month', () => {
    const expenses = [
      expense(1100, 'Potraviny', '2026-09-05'),
      expense(1000, 'Potraviny', '2026-08-03'),
      // After the 10th of August: not part of "the same days", so not compared.
      expense(9000, 'Potraviny', '2026-08-25'),
    ]
    const result = periodOverPeriodChange(expenses, '2026-09-10')
    expect(result).toMatchObject({ current: 1100, previous: 1000 })
    expect(result?.changePercent).toBeCloseTo(10, 5)
  })

  it('reports a negative change when spending less than last month', () => {
    const result = periodOverPeriodChange([expense(500, 'Potraviny', '2026-09-02'), expense(1000, 'Potraviny', '2026-08-02')], '2026-09-10')
    expect(result?.changePercent).toBeLessThan(0)
  })

  it('compares the 31st with the whole of a shorter previous month', () => {
    const result = periodOverPeriodChange([expense(100, 'Potraviny', '2026-03-31'), expense(200, 'Potraviny', '2026-02-28')], '2026-03-31')
    expect(result?.previous).toBe(200)
  })

  it('has no comparison when the previous month has no expenses, rather than an invented baseline', () => {
    expect(periodOverPeriodChange([expense(500)], '2026-09-10')).toBeNull()
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

describe('weeklyAllowance', () => {
  it('spreads what is left over the weeks remaining in the month, today included', () => {
    // 25 September: 6 days left (25th–30th) — less than a week, so all of it.
    expect(weeklyAllowance(4650, '2026-09-25')).toBe(4650)
    // 3 September: 28 days left = 4 weeks.
    expect(weeklyAllowance(4000, '2026-09-03')).toBeCloseTo(1000)
  })

  it('is nothing once the budget is used up', () => {
    expect(weeklyAllowance(0, '2026-09-10')).toBe(0)
    expect(weeklyAllowance(-200, '2026-09-10')).toBe(0)
  })
})

describe('budgetPace', () => {
  it('spreads what is left over the remaining days, today included', () => {
    // 25 September: 6 days left (25–30). 10 000 − 8 640 = 1 360 → ~226.67 a day.
    const pace = budgetPace(8640, 10000, '2026-09-25')!
    expect(pace.daysLeft).toBe(6)
    expect(pace.perDayLeft).toBeCloseTo(226.67, 2)
  })

  it('projects the month end at the current rate and reports the overrun', () => {
    // 8 640 in 25 days → 345.6 a day → 10 368 over 30 days, 368 over the limit.
    const pace = budgetPace(8640, 10000, '2026-09-25')!
    expect(pace.projected).toBeCloseTo(10368, 5)
    expect(pace.projectedOver).toBeCloseTo(368, 5)
    expect(budgetPace(5000, 10000, '2026-09-25')!.projectedOver).toBeNull()
  })

  it('does not project before the 7th', () => {
    const pace = budgetPace(3000, 10000, '2026-09-02')!
    expect(pace.projected).toBeNull()
    expect(pace.projectedOver).toBeNull()
    expect(budgetPace(3000, 10000, `2026-09-0${PACE_MIN_DAYS}`)!.projected).not.toBeNull()
  })

  it('has no allowance left once over the limit, and nothing without a budget', () => {
    expect(budgetPace(12000, 10000, '2026-09-25')!.perDayLeft).toBe(0)
    expect(budgetPace(500, 0, '2026-09-25')).toBeNull()
  })
})

describe('expense overview by month', () => {
  const paid = (amount: number, category: Expense['category'], subcategory: string | null, date: string): Expense => ({ id: `${date}-${amount}`, amount, note: '', category, subcategory, date, purchaseId: null })
  const expenses = [
    paid(12000, 'Bydlení', 'Nájem nebo hypotéka', '2026-09-01'),
    paid(1890, 'Bydlení', 'Elektřina', '2026-09-15'),
    paid(1500, 'Auto', 'Palivo', '2026-09-03'),
    paid(1400, 'Auto', 'Palivo', '2026-09-20'),
    paid(900, 'Auto', null, '2026-09-10'),
    paid(800, 'Oblečení a obuv', 'Obuv', '2026-08-30'),
  ]

  it('lists the current month and every month with an expense, newest first', () => {
    expect(expensePeriods(expenses, '2026-10-02')).toEqual(['2026-10-01', '2026-09-01', '2026-08-01'])
  })

  it("sums one month's expenses by category and subcategory, largest first, with the payments newest first", () => {
    const summary = periodSummary(expenses, '2026-09-01')
    expect(summary.total).toBe(17690)
    expect(summary.categories.map((entry) => [entry.category, entry.total])).toEqual([
      ['Bydlení', 13890],
      ['Auto', 3800],
    ])
    expect(summary.categories[1].subcategories).toEqual([
      { subcategory: 'Palivo', total: 2900 },
      { subcategory: null, total: 900 },
    ])
    expect(summary.categories[1].expenses.map((entry) => entry.date)).toEqual(['2026-09-20', '2026-09-10', '2026-09-03'])
  })

  it('is empty for a month without expenses', () => {
    expect(periodSummary(expenses, '2026-10-01')).toEqual({ total: 0, categories: [] })
  })
})

describe('categoryRows', () => {
  const paid = (amount: number, category: Expense['category'], date = '2026-09-10'): Expense => ({ id: `${category}-${amount}`, amount, note: '', category, subcategory: null, date, purchaseId: null })
  const summary = periodSummary([paid(4200, 'Auto'), paid(900, 'Zdraví'), paid(12000, 'Bydlení')], '2026-09-01')

  it('puts each limit next to its category, with the 80 % / 100 % level', () => {
    const rows = categoryRows(summary, { Auto: 5000, Bydlení: 11000 })
    expect(rows.map((row) => [row.category, row.total, row.limit, row.level])).toEqual([
      ['Bydlení', 12000, 11000, 'over'],
      ['Auto', 4200, 5000, 'warning'],
      ['Zdraví', 900, null, 'ok'],
    ])
  })

  it('shows a limited category with nothing spent yet, after the spent ones', () => {
    const rows = categoryRows(summary, { Potraviny: 8000, 'Oblečení a obuv': 1500 })
    expect(rows.slice(3).map((row) => [row.category, row.total, row.limit, row.level])).toEqual([
      ['Potraviny', 0, 8000, 'ok'],
      ['Oblečení a obuv', 0, 1500, 'ok'],
    ])
  })
})

describe('budget periods that start on a chosen day', () => {
  const on = (amount: number, date: string): Expense => expense(amount, 'Potraviny', date)

  it('finds the period a date falls in, across month and year boundaries', () => {
    expect(periodStart('2026-09-27', 28)).toBe('2026-08-28')
    expect(periodStart('2026-09-28', 28)).toBe('2026-09-28')
    expect(periodStart('2027-01-10', 28)).toBe('2026-12-28')
    expect(periodStart('2026-09-25')).toBe('2026-09-01')
  })

  it('ends a period on the day before the next one starts, including February', () => {
    expect(nextPeriodStart('2026-12-28')).toBe('2027-01-28')
    expect(periodEnd('2026-08-28')).toBe('2026-09-27')
    expect(periodEnd('2026-09-01')).toBe('2026-09-30')
    expect(periodEnd('2028-02-01')).toBe('2028-02-29')
    expect(periodEnd('2027-01-28')).toBe('2027-02-27')
  })

  it('counts the length, the day and the days left of a period from its own start', () => {
    // 28 Aug – 27 Sep is 31 days; 25 Sep is its 29th day, leaving 3 days (25th–27th).
    expect(periodLength('2026-09-25', 28)).toBe(31)
    expect(periodDay('2026-09-25', 28)).toBe(29)
    expect(periodDay('2026-08-28', 28)).toBe(1)
    expect(previousPeriodStart('2026-09-25', 28)).toBe('2026-07-28')
  })

  it('keeps only the expenses of the period today falls in', () => {
    const expenses = [on(1, '2026-08-27'), on(2, '2026-08-28'), on(3, '2026-09-27'), on(4, '2026-09-28')]
    expect(expensesInPeriod(expenses, '2026-09-10', 28).map((e) => e.amount)).toEqual([2, 3])
    expect(expensesInPeriod(expenses, '2026-09-30', 28).map((e) => e.amount)).toEqual([4])
  })

  it('averages over the days elapsed since the period start, not since the 1st', () => {
    // 28 Aug – 7 Sep is 11 days elapsed.
    expect(dailyAverage([on(1100, '2026-08-30')], '2026-09-07', 28)).toBeCloseTo(100)
    expect(projectedPeriodEnd([on(1100, '2026-08-30')], '2026-09-07', 28)).toBeCloseTo(100 * 31)
  })

  it('compares with the same days of the previous period', () => {
    const expenses = [on(1100, '2026-09-01'), on(1000, '2026-07-30'), on(9000, '2026-08-20')]
    // 7 Sep is day 11 of the period from 28 Aug; the previous one (28 Jul) is compared up to 7 Aug.
    const result = periodOverPeriodChange(expenses, '2026-09-07', 28)
    expect(result).toMatchObject({ current: 1100, previous: 1000 })
  })

  it('pages by period start and sums per period', () => {
    const expenses = [on(10, '2026-08-27'), on(20, '2026-08-28'), on(30, '2026-09-27')]
    expect(expensePeriods(expenses, '2026-09-30', 28)).toEqual(['2026-09-28', '2026-08-28', '2026-07-28'])
    expect(periodSummary(expenses, '2026-08-28', 28).total).toBe(50)
    expect(periodSummary(expenses, '2026-07-28', 28).total).toBe(10)
  })

  it('paces the budget over the period length', () => {
    // 25 Sep is day 29 of 31: 3 days left.
    const pace = budgetPace(3100, 10000, '2026-09-25', 28)!
    expect(pace.daysLeft).toBe(3)
    expect(pace.projected).toBeCloseTo((3100 / 29) * 31)
    // 3 days left is under a week: the whole remainder is available.
    expect(weeklyAllowance(4650, '2026-09-25', 28)).toBe(4650)
  })

  it('accepts only whole start days from 1 to 28', () => {
    expect([1, 15, 28].every(isValidPeriodStartDay)).toBe(true)
    expect([0, 29, 31, 1.5, -1, Number.NaN].some(isValidPeriodStartDay)).toBe(false)
  })
})

describe('subcategoryGroups', () => {
  it('lists each subcategory once with its total and its own payments, largest first', () => {
    const meat = { ...expense(300), subcategory: 'Maso' }
    const dairy1 = { ...expense(120), subcategory: 'Mléčné výrobky', date: '2026-09-12' }
    const dairy2 = { ...expense(80), subcategory: 'Mléčné výrobky' }
    const other = expense(50)
    const [entry] = periodSummary([meat, dairy1, dairy2, other], '2026-09-01').categories
    const groups = subcategoryGroups(entry)
    expect(groups.map((group) => [group.subcategory, group.total, group.expenses.length])).toEqual([
      ['Maso', 300, 1],
      ['Mléčné výrobky', 200, 2],
      [null, 50, 1],
    ])
    expect(groups[1].expenses[0].id).toBe(dairy1.id)
  })
})

describe('groupExpensesByPurchase', () => {
  it('joins a receipt split by category back into one purchase, keeping the order and the total', () => {
    const single = { ...expense(500, 'Bydlení', '2026-09-20'), note: 'Nájem' }
    const partA = { ...expense(123.45, 'Potraviny', '2026-09-15'), note: 'Albert', purchaseId: 'p1' }
    const partB = { ...expense(76.55, 'Drogerie', '2026-09-15'), note: 'Albert', purchaseId: 'p1' }
    const otherReceipt = { ...expense(40, 'Potraviny', '2026-09-10'), note: 'Lidl', purchaseId: 'p2' }
    const entries = groupExpensesByPurchase([single, partA, partB, otherReceipt])
    expect(entries.map((entry) => entry.kind)).toEqual(['single', 'purchase', 'purchase'])
    expect(entries[1]).toMatchObject({ kind: 'purchase', purchaseId: 'p1', note: 'Albert', date: '2026-09-15', total: 200 })
    expect(entries[1].kind === 'purchase' && entries[1].parts.map((part) => part.id)).toEqual([partA.id, partB.id])
  })
})

describe('budget by period', () => {
  it("uses a period's own budget, else the default", () => {
    expect(budgetForPeriod('2026-10-01', { '2026-10-01': 30000 }, 26000)).toBe(30000)
    expect(budgetForPeriod('2026-11-01', { '2026-10-01': 30000 }, 26000)).toBe(26000)
  })

  it('sums daily totals per period, also for a period starting on the 15th', () => {
    const daily = [
      { date: '2026-09-14', total: 100 },
      { date: '2026-09-15', total: 200.1 },
      { date: '2026-10-14', total: 50.2 },
      { date: '2026-10-15', total: 10 },
    ]
    expect(Object.fromEntries(spendingByPeriod(daily, 15))).toEqual({ '2026-08-15': 100, '2026-09-15': 250.3, '2026-10-15': 10 })
  })

  it('saves budget minus spending, negative when overspent, nothing without a budget', () => {
    expect(periodSavings(26000, 23500)).toBe(2500)
    expect(periodSavings(26000, 27000)).toBe(-1000)
    expect(periodSavings(0, 500)).toBeNull()
  })

  it('totals the finished periods with a budget, not the current one', () => {
    const spending = new Map([
      ['2026-08-01', 20000],
      ['2026-09-01', 27000],
      ['2026-10-01', 5000],
    ])
    const history = savingsHistory(spending, '2026-10-01', (period) => (period === '2026-08-01' ? 25000 : 26000))
    expect(history.periods.map((entry) => [entry.period, entry.saved])).toEqual([
      ['2026-08-01', 5000],
      ['2026-09-01', -1000],
    ])
    expect(history.total).toBe(4000)
    expect(savingsHistory(spending, '2026-10-01', () => 0).periods).toEqual([])
  })
})
