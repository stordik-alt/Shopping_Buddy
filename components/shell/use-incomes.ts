'use client'

import { useCallback, useEffect, useState } from 'react'
import { addIncomeAction, deleteIncomeAction, getPeriodIncomesAction, markIncomeReceivedAction, updateIncomeAction } from '@/app/actions/incomes'
import type { IncomeInput } from '@/lib/income-input'
import type { Income } from '@/lib/types'

const byDate = (a: Income, b: Income) => a.date.localeCompare(b.date)

/** The incomes of one budget period (docs/15_BUDGET_PERIODS.md §8), loaded when the planning view is
 *  opened (`active`) and again if the period changes. Like the other budget hooks, a change is shown
 *  from the row the server returns, with no page reload. */
export function useIncomes({ period, until, active }: { period: string; until: string; active: boolean }) {
  const [incomes, setIncomes] = useState<Income[] | null>(null)
  const [error, setError] = useState('')

  // Another period (or start day) means other incomes.
  useEffect(() => {
    setIncomes(null)
    setError('')
  }, [period])

  useEffect(() => {
    if (!active || incomes !== null || error) return
    let cancelled = false
    getPeriodIncomesAction(period).then(
      (rows) => !cancelled && setIncomes(rows),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Příjmy se nepodařilo načíst.'),
    )
    return () => {
      cancelled = true
    }
  }, [active, incomes, error, period])

  const retry = useCallback(() => setError(''), [])

  // Income dated in another period is saved but is not part of this view (it loads with its own period),
  // and an edit can move a row out of this one.
  const inPeriod = useCallback((income: Income) => income.date >= period && income.date < until, [period, until])

  const add = useCallback(
    async (input: IncomeInput) => {
      const income = await addIncomeAction(input)
      setIncomes((current) => (current === null ? current : [...current, income].filter(inPeriod).sort(byDate)))
    },
    [inPeriod],
  )

  const update = useCallback(
    async (id: string, input: Omit<IncomeInput, 'status'>) => {
      const income = await updateIncomeAction(id, input)
      setIncomes((current) => (current === null ? current : current.map((row) => (row.id === id ? income : row)).filter(inPeriod).sort(byDate)))
    },
    [inPeriod],
  )

  const remove = useCallback(async (id: string) => {
    await deleteIncomeAction(id)
    setIncomes((current) => (current === null ? current : current.filter((row) => row.id !== id)))
  }, [])

  const receive = useCallback(async (id: string) => {
    const income = await markIncomeReceivedAction(id)
    setIncomes((current) => (current === null ? current : current.map((row) => (row.id === id ? income : row)).sort(byDate)))
  }, [])

  return { incomes, error, retry, add, update, remove, receive }
}
