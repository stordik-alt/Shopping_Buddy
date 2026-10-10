'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPeriodHistoryAction } from '@/app/actions/period-history'
import type { PeriodHistoryRow } from '@/lib/budget-history'

/** The past budget periods (docs/15_BUDGET_PERIODS.md §18), loaded when the history is opened
 *  (`active`) and again when `reloadKey` changes (a period was closed, reopened or the setting changed).
 *  Read-only: all numbers are the server's. */
export function usePeriodHistory({ active, reloadKey }: { active: boolean; reloadKey: string }) {
  const [rows, setRows] = useState<PeriodHistoryRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setRows(null)
    setError('')
  }, [reloadKey])

  useEffect(() => {
    if (!active || rows !== null || error) return
    let cancelled = false
    getPeriodHistoryAction().then(
      (next) => !cancelled && setRows(next),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'Historii období se nepodařilo načíst.'),
    )
    return () => {
      cancelled = true
    }
  }, [active, rows, error, reloadKey])

  const retry = useCallback(() => setError(''), [])
  return { rows, error, retry }
}
