'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addPlannedExpenseAction,
  deletePlannedExpenseAction,
  getPeriodPlannedExpensesAction,
  payPlannedExpenseAction,
  updatePlannedExpenseAction,
} from '@/app/actions/planned-expenses'
import type { PlannedExpenseInput } from '@/lib/planned-expense-input'
import type { Expense, Notification, PlannedExpense } from '@/lib/types'

const byDate = (a: PlannedExpense, b: PlannedExpense) => a.date.localeCompare(b.date)

/** The planned expenses of one budget period (docs/15_BUDGET_PERIODS.md §7–8), loaded when the planning
 *  view is opened (`active`) and again if the period changes. Paying one creates a real expense on the
 *  server; `onPaid` hands that expense to the page so Výdaje and the balance see it at once. */
export function usePlannedExpenses({
  period,
  until,
  active,
  onPaid,
}: {
  period: string
  until: string
  active: boolean
  onPaid: (expense: Expense, notifications: Notification[]) => void
}) {
  const [plannedExpenses, setPlannedExpenses] = useState<PlannedExpense[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setPlannedExpenses(null)
    setError('')
  }, [period])

  useEffect(() => {
    if (!active || plannedExpenses !== null || error) return
    let cancelled = false
    getPeriodPlannedExpensesAction(period).then(
      (rows) => !cancelled && setPlannedExpenses(rows),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Plánované výdaje se nepodařilo načíst.'),
    )
    return () => {
      cancelled = true
    }
  }, [active, plannedExpenses, error, period])

  const retry = useCallback(() => setError(''), [])
  const inPeriod = useCallback((row: PlannedExpense) => row.date >= period && row.date < until, [period, until])

  const add = useCallback(
    async (input: PlannedExpenseInput) => {
      const row = await addPlannedExpenseAction(input)
      setPlannedExpenses((current) => (current === null ? current : [...current, row].filter(inPeriod).sort(byDate)))
    },
    [inPeriod],
  )

  const update = useCallback(
    async (id: string, input: PlannedExpenseInput) => {
      const row = await updatePlannedExpenseAction(id, input)
      setPlannedExpenses((current) => (current === null ? current : current.map((entry) => (entry.id === id ? row : entry)).filter(inPeriod).sort(byDate)))
    },
    [inPeriod],
  )

  const remove = useCallback(async (id: string) => {
    await deletePlannedExpenseAction(id)
    setPlannedExpenses((current) => (current === null ? current : current.filter((entry) => entry.id !== id)))
  }, [])

  const pay = useCallback(
    async (id: string) => {
      const { expense, plannedExpense, notifications } = await payPlannedExpenseAction(id)
      setPlannedExpenses((current) => (current === null ? current : current.map((entry) => (entry.id === id ? plannedExpense : entry)).sort(byDate)))
      onPaid(expense, notifications)
    },
    [onPaid],
  )

  return { plannedExpenses, error, retry, add, update, remove, pay }
}
