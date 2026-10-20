import { describe, expect, it } from 'vitest'
import {
  isRecurringIncomeDueDate,
  recurringIncomeDueDate,
  recurringIncomeOverview,
  validateRecurringIncomeInput,
  type RecurringIncome,
  type RecurringIncomeOccurrence,
} from '@/lib/recurring-incomes'

const salary: RecurringIncome = {
  id: 'salary',
  description: 'Výplata',
  expectedAmount: 30_000,
  intervalMonths: 1,
  startDate: '2030-01-31',
  active: true,
}

describe('recurring income date rules', () => {
  it('keeps the start day and falls back to the last day of shorter months', () => {
    expect(recurringIncomeDueDate('2030-01-31', 1, 1)).toBe('2030-02-28')
    expect(recurringIncomeDueDate('2030-01-31', 1, 2)).toBe('2030-03-31')
  })

  it('supports quarterly, half-yearly and yearly schedules', () => {
    expect(recurringIncomeDueDate('2030-01-15', 3, 1)).toBe('2030-04-15')
    expect(recurringIncomeDueDate('2030-01-15', 6, 1)).toBe('2030-07-15')
    expect(recurringIncomeDueDate('2030-01-15', 12, 1)).toBe('2031-01-15')
  })

  it('validates actual due dates and rejects invalid schedules', () => {
    expect(isRecurringIncomeDueDate(salary, '2030-02-28')).toBe(true)
    expect(isRecurringIncomeDueDate(salary, '2030-02-27')).toBe(false)
    expect(validateRecurringIncomeInput({ description: '  ', expectedAmount: 10, intervalMonths: 1, startDate: '2030-01-01' }, '2030-01-01')).toMatchObject({ error: expect.any(String) })
    expect(validateRecurringIncomeInput({ description: 'Výplata', expectedAmount: -10, intervalMonths: 1, startDate: '2030-01-01' }, '2030-01-01')).toMatchObject({ error: expect.any(String) })
    expect(validateRecurringIncomeInput({ description: 'Výplata', expectedAmount: 10, intervalMonths: 2, startDate: '2030-01-01' }, '2030-01-01')).toMatchObject({ error: expect.any(String) })
  })
})

describe('recurring income overview', () => {
  it('offers due occurrences until handled and upcoming occurrences separately', () => {
    const monthly: RecurringIncome = { ...salary, startDate: '2030-10-15' }
    const occurrences: RecurringIncomeOccurrence[] = [
      { recurringIncomeId: 'salary', dueDate: '2030-10-15', status: 'received' },
      { recurringIncomeId: 'salary', dueDate: '2030-11-15', status: 'skipped' },
    ]
    const overview = recurringIncomeOverview([monthly], occurrences, '2030-11-20')
    expect(overview.due.map((item) => item.dueDate)).toEqual([])
    expect(overview.upcoming.map((item) => item.dueDate)).toEqual([])
  })

  it('lists overdue unhandled occurrences and does not forecast a stopped schedule', () => {
    const active: RecurringIncome = { ...salary, startDate: '2030-10-01' }
    const stopped: RecurringIncome = { ...salary, id: 'stopped', active: false, startDate: '2030-11-01' }
    const overview = recurringIncomeOverview([active, stopped], [], '2030-10-20')
    expect(overview.due.map((item) => item.dueDate)).toEqual(['2030-10-01'])
    expect(overview.upcoming.map((item) => item.dueDate)).toEqual(['2030-11-01'])
    expect(overview.upcoming.every((item) => item.income.id !== 'stopped')).toBe(true)
  })
})
