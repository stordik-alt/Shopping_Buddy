'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBudgetOutlookAction, setPlannedCarryAction } from '@/app/actions/budget-outlook'
import type { BudgetOutlook } from '@/lib/types'

/** The sums the outlook for the periods ahead is calculated from (docs/15_BUDGET_PERIODS.md §14, §16),
 *  loaded when Plánování is opened (`active`) and again when `reloadKey` changes (a plan, income or
 *  planned expense changed). The expected balances themselves are worked out by lib/budget-outlook.ts. */
export function useBudgetOutlook({ active, reloadKey }: { active: boolean; reloadKey: string }) {
  const [outlook, setOutlook] = useState<BudgetOutlook | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setOutlook(null)
    setError('')
  }, [reloadKey])

  useEffect(() => {
    if (!active || outlook !== null || error) return
    let cancelled = false
    getBudgetOutlookAction().then(
      (next) => !cancelled && setOutlook(next),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Výhled se nepodařilo načíst.'),
    )
    return () => {
      cancelled = true
    }
  }, [active, outlook, error, reloadKey])

  const retry = useCallback(() => setError(''), [])

  /** Saves (or clears, with null) the transfer planned for the period starting at `period`, then reads
   *  the outlook again so every figure follows it. */
  const planCarry = useCallback(async (period: string, amount: number | null) => {
    await setPlannedCarryAction(period, amount)
    setOutlook(null)
  }, [])

  return { outlook, error, retry, planCarry }
}
