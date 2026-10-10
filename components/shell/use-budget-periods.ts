'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBudgetHistoryAction, getPeriodExpensesAction, setPeriodBudgetAction, setSavingsGoalAction } from '@/app/actions/budget'
import { periodStart } from '@/lib/budget'
import { periodConfigKey, type PeriodConfig } from '@/lib/budget-period'
import type { HouseholdData } from '@/lib/db/queries'
import type { Expense } from '@/lib/types'

type DailyTotal = { date: string; total: number }

/** Budget by period (docs/15_BUDGET_PERIODS.md): the period budgets and the savings goal, and the past
 *  periods, which the page does not load up front — the spending per day when Rozpočet is open
 *  (`active`), and a past period's expenses when Výdaje shows it. */
export function useBudgetPeriods({ initialData, today, period, active }: { initialData: HouseholdData; today: string; period: PeriodConfig; active: boolean }) {
  const [periodBudgets, setPeriodBudgets] = useState(initialData.household.periodBudgets)
  const [savingsGoal, setSavingsGoal] = useState(initialData.household.savingsGoal)
  const [history, setHistory] = useState<DailyTotal[] | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [pastExpenses, setPastExpenses] = useState<Record<string, Expense[]>>({})
  const [loadingPeriod, setLoadingPeriod] = useState<string | null>(null)
  // A period whose load failed is not retried on its own (the ledger asks on every render change), only
  // from its retry button.
  const [periodError, setPeriodError] = useState<{ period: string; message: string } | null>(null)
  const currentStart = periodStart(today, period)
  // The config object is rebuilt on every household update; its key changes only when the period does.
  const periodKey = periodConfigKey(period)

  useEffect(() => {
    setPeriodBudgets(initialData.household.periodBudgets)
    setSavingsGoal(initialData.household.savingsGoal)
  }, [initialData])

  // Everything loaded was cut by the old period; a new one makes other periods.
  useEffect(() => {
    setHistory(null)
    setPastExpenses({})
  }, [periodKey])

  useEffect(() => {
    if (!active || history !== null || historyError) return
    let cancelled = false
    getBudgetHistoryAction().then(
      (rows) => !cancelled && setHistory(rows),
      (error: unknown) => !cancelled && setHistoryError(error instanceof Error ? error.message : 'Minulá období se nepodařilo načíst.'),
    )
    return () => {
      cancelled = true
    }
  }, [active, history, historyError])

  const retryHistory = useCallback(() => {
    setHistoryError('')
    setHistory(null)
  }, [])

  /** Loads a past period's expenses once; the current period is already on the page. */
  const openPeriod = useCallback(
    async (period: string) => {
      if (period >= currentStart || pastExpenses[period] || loadingPeriod === period || periodError?.period === period) return
      setLoadingPeriod(period)
      try {
        const rows = await getPeriodExpensesAction(period)
        setPastExpenses((current) => ({ ...current, [period]: rows }))
      } catch (error) {
        setPeriodError({ period, message: error instanceof Error ? error.message : 'Výdaje období se nepodařilo načíst.' })
      } finally {
        setLoadingPeriod((current) => (current === period ? null : current))
      }
    },
    [currentStart, pastExpenses, loadingPeriod, periodError],
  )

  const retryPeriod = useCallback(() => setPeriodError(null), [])

  /** An expense dated in a past period was added, changed or removed: that period's copy and the
   *  per-day totals are out of date, so both are loaded again when next needed. */
  const expenseDatesChanged = useCallback(
    (dates: string[]) => {
      const past = dates.filter((date) => date < currentStart).map((date) => periodStart(date, period))
      if (past.length === 0) return
      setPastExpenses((current) => Object.fromEntries(Object.entries(current).filter(([start]) => !past.includes(start))))
      setHistory(null)
    },
    [currentStart, period],
  )

  async function savePlan(changes: { periodBudgets: { period: string; amount: number | null }[]; savingsGoal?: number }) {
    let latest = periodBudgets
    for (const change of changes.periodBudgets) latest = await setPeriodBudgetAction(change.period, change.amount)
    setPeriodBudgets(latest)
    if (changes.savingsGoal !== undefined) setSavingsGoal(await setSavingsGoalAction(changes.savingsGoal))
  }

  return { periodBudgets, savingsGoal, history, historyError, retryHistory, pastExpenses, loadingPeriod, periodError, retryPeriod, openPeriod, expenseDatesChanged, savePlan }
}
