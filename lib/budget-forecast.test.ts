import { describe, expect, it } from 'vitest'
import { forecastPeriod, pendingCommitments, remainingPlannedTransfers } from '@/lib/budget-forecast'
import type { RecurringPayment } from '@/lib/recurring-payments'

const rent: RecurringPayment = { id: 'rent', name: 'Nájem', category: 'Domácnost', subcategory: null, amount: 12_000, intervalMonths: 1, startDate: '2026-01-05', active: true }
const phone: RecurringPayment = { id: 'phone', name: 'Telefon', category: 'Domácnost', subcategory: null, amount: 600, intervalMonths: 1, startDate: '2026-01-20', active: true }

const base = { expectedIncome: 0, commitments: [], plannedTransfers: 0, pockets: [] }

describe('pendingCommitments', () => {
  it('lists unpaid due dates of the period and skips paid, skipped and stopped ones', () => {
    const result = pendingCommitments(
      [rent, phone, { ...phone, id: 'old', name: 'Staré', active: false }],
      [{ recurringPaymentId: 'rent', dueDate: '2026-10-05', status: 'paid' }],
      '2026-10-01',
      '2026-10-31',
    )
    expect(result.map((entry) => entry.name)).toEqual(['Telefon'])
    expect(result[0].dueDate).toBe('2026-10-20')
  })

  it('counts an overdue payment that was never confirmed', () => {
    expect(pendingCommitments([rent], [], '2026-10-01', '2026-10-31')).toHaveLength(1)
  })

  it('takes only the due dates inside a non-calendar period', () => {
    const result = pendingCommitments([rent], [], '2026-10-15', '2026-11-14')
    expect(result.map((entry) => entry.dueDate)).toEqual(['2026-11-05'])
  })
})

describe('remainingPlannedTransfers', () => {
  it('subtracts what was already deposited and never goes below 0', () => {
    expect(
      remainingPlannedTransfers([
        { plannedContribution: 1_000, depositedThisPeriod: 400 },
        { plannedContribution: 500, depositedThisPeriod: 900 },
        { plannedContribution: null, depositedThisPeriod: 0 },
      ]),
    ).toBe(600)
  })
})

describe('forecastPeriod', () => {
  it('predicts the end of the period from known money only', () => {
    const forecast = forecastPeriod({ ...base, actual: 6_800, expectedIncome: 0, commitments: [{ paymentId: 'a', name: 'Nájem', dueDate: '2026-10-25', amount: 3_800 }] })
    expect(forecast.available).toBe(3_000)
    expect(forecast.predicted).toBe(3_000)
    expect(forecast.shortfall).toBe(0)
    expect(forecast.advice).toEqual([])
  })

  it('warns in advance of a shortfall and proposes postponing savings first', () => {
    const forecast = forecastPeriod({
      ...base,
      actual: 1_000,
      commitments: [{ paymentId: 'a', name: 'Nájem', dueDate: '2026-10-25', amount: 3_000 }],
      plannedTransfers: 1_000,
    })
    expect(forecast.predicted).toBe(-3_000)
    expect(forecast.shortfall).toBe(3_000)
    expect(forecast.advice).toEqual([
      { kind: 'shortfall', amount: 3_000 },
      { kind: 'postpone-savings', amount: 1_000 },
      { kind: 'carry-deficit', amount: 2_000 },
    ])
  })

  it('proposes Kapsy, largest first, and never more than a Kapsa holds', () => {
    const forecast = forecastPeriod({
      ...base,
      actual: 0,
      commitments: [{ paymentId: 'a', name: 'Pojištění', dueDate: '2026-10-25', amount: 2_300 }],
      pockets: [
        { id: 'small', name: 'Dárky', balance: 500 },
        { id: 'big', name: 'Rezerva', balance: 1_500 },
      ],
    })
    expect(forecast.advice).toEqual([
      { kind: 'shortfall', amount: 2_300 },
      { kind: 'use-pocket', amount: 1_500, pocketId: 'big', pocketName: 'Rezerva', isReserve: false },
      { kind: 'use-pocket', amount: 500, pocketId: 'small', pocketName: 'Dárky', isReserve: false },
      { kind: 'carry-deficit', amount: 300 },
    ])
  })

  it('counts planned expenses in the prediction but not in the available balance', () => {
    const forecast = forecastPeriod({ ...base, actual: 5_000, plannedExpenses: 2_000 })
    expect(forecast.available).toBe(5_000)
    expect(forecast.predicted).toBe(3_000)
  })

  it('suggests spending less on planned expenses before touching any Kapsa, and the reserve first', () => {
    const forecast = forecastPeriod({
      ...base,
      actual: 1_000,
      plannedExpenses: 2_000,
      pockets: [
        { id: 'big', name: 'Auto', balance: 9_000 },
        { id: 'rez', name: 'Rezerva', balance: 9_000, isReserve: true },
      ],
    })
    expect(forecast.predicted).toBe(-1_000)
    expect(forecast.advice).toEqual([
      { kind: 'shortfall', amount: 1_000 },
      { kind: 'trim-expenses', amount: 1_000 },
    ])
    const deeper = forecastPeriod({ ...base, actual: 0, plannedExpenses: 500, commitments: [{ paymentId: 'a', name: 'Nájem', dueDate: '2026-10-25', amount: 2_000 }], pockets: [{ id: 'big', name: 'Auto', balance: 9_000 }, { id: 'rez', name: 'Rezerva', balance: 9_000, isReserve: true }] })
    expect(deeper.advice).toEqual([
      { kind: 'shortfall', amount: 2_500 },
      { kind: 'trim-expenses', amount: 500 },
      { kind: 'use-pocket', amount: 2_000, pocketId: 'rez', pocketName: 'Rezerva', isReserve: true },
    ])
  })

  it('does not call a planned income money in hand but counts it in the prediction', () => {
    const forecast = forecastPeriod({ ...base, actual: 500, expectedIncome: 30_000, commitments: [{ paymentId: 'a', name: 'Nájem', dueDate: '2026-10-05', amount: 12_000 }] })
    expect(forecast.available).toBe(-11_500)
    expect(forecast.predicted).toBe(18_500)
    expect(forecast.shortfall).toBe(0)
    expect(forecast.advice).toEqual([{ kind: 'payment-risk', amount: 11_500 }])
  })

  it('is quiet when nothing is wrong', () => {
    expect(forecastPeriod({ ...base, actual: 100 }).advice).toEqual([])
  })
})
