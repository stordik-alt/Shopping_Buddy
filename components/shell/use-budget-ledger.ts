'use client'

import { useCallback, useEffect, useState } from 'react'
import { closePeriodAction, reopenPeriodAction, type CloseInput } from '@/app/actions/period-closing'
import {
  addPocketAction,
  archivePocketAction,
  getBudgetLedgerAction,
  transferToPocketAction,
  updatePocketAction,
  withdrawFromPocketAction,
} from '@/app/actions/pockets'
import type { PocketInput } from '@/lib/pocket-input'
import type { BudgetLedger } from '@/lib/types'

/** Kapsy, the carry from the previous period and the period waiting to be closed
 *  (docs/15_BUDGET_PERIODS.md §11–15), loaded when the planning view is opened (`active`) and again if
 *  the period changes. Every change is done on the server first and then the ledger is read again:
 *  the numbers (balances, carry, limits) are the server's, never worked out here. */
export function useBudgetLedger({ period, active }: { period: string; active: boolean }) {
  const [ledger, setLedger] = useState<BudgetLedger | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setLedger(null)
    setError('')
  }, [period])

  useEffect(() => {
    if (!active || ledger !== null || error) return
    let cancelled = false
    getBudgetLedgerAction(period).then(
      (next) => !cancelled && setLedger(next),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Kapsy se nepodařilo načíst.'),
    )
    return () => {
      cancelled = true
    }
  }, [active, ledger, error, period])

  const retry = useCallback(() => setError(''), [])

  /** Runs a server change, then shows the server's fresh ledger. A failure of the change is thrown to
   *  the caller (the form shows it); a failure only of the reload is shown as the view's error. */
  const change = useCallback(
    async (task: () => Promise<void>) => {
      await task()
      try {
        setLedger(await getBudgetLedgerAction(period))
      } catch (err) {
        setLedger(null)
        setError(err instanceof Error ? err.message : 'Kapsy se nepodařilo načíst.')
      }
    },
    [period],
  )

  return {
    ledger,
    error,
    retry,
    addPocket: useCallback((input: PocketInput) => change(() => addPocketAction(input)), [change]),
    updatePocket: useCallback((id: string, input: PocketInput) => change(() => updatePocketAction(id, input)), [change]),
    archivePocket: useCallback((id: string) => change(() => archivePocketAction(id)), [change]),
    saveToPocket: useCallback((id: string, amount: number) => change(() => transferToPocketAction(id, amount)), [change]),
    takeFromPocket: useCallback((id: string, amount: number) => change(() => withdrawFromPocketAction(id, amount)), [change]),
    closePeriod: useCallback((input: CloseInput) => change(() => closePeriodAction(input)), [change]),
    reopenPeriod: useCallback((periodStart: string) => change(() => reopenPeriodAction(periodStart)), [change]),
  }
}
