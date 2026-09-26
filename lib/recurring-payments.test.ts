import { describe, expect, it } from 'vitest'
import { dueDateAt, dueDatesBetween, isDueDate, paymentsToRemind, recurringOverview, type RecurringPayment } from '@/lib/recurring-payments'

const payment = (overrides: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'rent',
  name: 'Nájem',
  category: 'Bydlení',
  subcategory: 'Nájem nebo hypotéka',
  amount: 12000,
  intervalMonths: 1,
  startDate: '2026-07-15',
  active: true,
  ...overrides,
})

describe('due dates', () => {
  it('repeat on the start day every interval', () => {
    expect(dueDatesBetween(payment(), '2026-07-01', '2026-10-31')).toEqual(['2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15'])
    expect(dueDatesBetween(payment({ intervalMonths: 3, startDate: '2026-01-10' }), '2026-01-01', '2026-12-31')).toEqual(['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10'])
    expect(dueDateAt('2026-03-01', 12, 2)).toBe('2028-03-01')
  })

  it('fall on the last day of a shorter month, and return to the start day after it', () => {
    expect(dueDatesBetween(payment({ startDate: '2026-01-31' }), '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(dueDateAt('2027-01-31', 1, 1)).toBe('2027-02-28')
    expect(dueDateAt('2028-01-31', 1, 1)).toBe('2028-02-29')
  })

  it('cross the year', () => {
    expect(dueDatesBetween(payment({ startDate: '2026-11-05' }), '2026-11-01', '2027-02-28')).toEqual(['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05'])
  })

  it('tell a due date from any other day', () => {
    expect(isDueDate(payment(), '2026-09-15')).toBe(true)
    expect(isDueDate(payment(), '2026-09-16')).toBe(false)
    expect(isDueDate(payment(), '2026-06-15')).toBe(false) // before the start
  })
})

describe('recurringOverview', () => {
  it('offers the unhandled due dates up to today, oldest first, and the next one ahead', () => {
    const { due, upcoming } = recurringOverview([payment()], [{ recurringPaymentId: 'rent', dueDate: '2026-07-15', status: 'paid' }], '2026-09-26')
    expect(due.map((entry) => entry.dueDate)).toEqual(['2026-08-15', '2026-09-15'])
    expect(upcoming.map((entry) => entry.dueDate)).toEqual(['2026-10-15'])
  })

  it('treats a skipped due date as dealt with', () => {
    const { due } = recurringOverview([payment()], [{ recurringPaymentId: 'rent', dueDate: '2026-08-15', status: 'skipped' }, { recurringPaymentId: 'rent', dueDate: '2026-07-15', status: 'paid' }], '2026-09-26')
    expect(due.map((entry) => entry.dueDate)).toEqual(['2026-09-15'])
  })

  it('offers today’s due date, and at most the last three unhandled ones', () => {
    expect(recurringOverview([payment({ startDate: '2026-09-26' })], [], '2026-09-26').due.map((entry) => entry.dueDate)).toEqual(['2026-09-26'])
    expect(recurringOverview([payment({ startDate: '2025-01-15' })], [], '2026-09-26').due.map((entry) => entry.dueDate)).toEqual(['2026-07-15', '2026-08-15', '2026-09-15'])
  })

  it('says nothing about a stopped payment, or one whose next due date is far off', () => {
    expect(recurringOverview([payment({ active: false })], [], '2026-09-26')).toEqual({ due: [], upcoming: [] })
    const yearly = recurringOverview([payment({ intervalMonths: 12, startDate: '2026-03-01' })], [{ recurringPaymentId: 'rent', dueDate: '2026-03-01', status: 'paid' }], '2026-09-26')
    expect(yearly).toEqual({ due: [], upcoming: [] })
  })

  it('offers nothing older than a year, the history the page loads', () => {
    // A yearly payment paid 18 months ago: that payment is not loaded any more, and must not come back.
    const yearly = payment({ intervalMonths: 12, startDate: '2024-03-01' })
    expect(recurringOverview([yearly], [], '2026-09-26').due.map((entry) => entry.dueDate)).toEqual(['2026-03-01'])
  })
})

describe('paymentsToRemind', () => {
  const rent = { ...payment({ startDate: '2026-07-26' }), remindedDueDate: null as string | null }

  it('reminds of a payment due today, once', () => {
    expect(paymentsToRemind([rent], [], '2026-09-26').map((entry) => entry.id)).toEqual(['rent'])
    expect(paymentsToRemind([{ ...rent, remindedDueDate: '2026-09-26' }], [], '2026-09-26')).toEqual([])
  })

  it('does not remind of one already dealt with, not due today, or stopped', () => {
    expect(paymentsToRemind([rent], [{ recurringPaymentId: 'rent', dueDate: '2026-09-26', status: 'paid' }], '2026-09-26')).toEqual([])
    expect(paymentsToRemind([rent], [], '2026-09-25')).toEqual([])
    expect(paymentsToRemind([{ ...rent, active: false }], [], '2026-09-26')).toEqual([])
  })
})
