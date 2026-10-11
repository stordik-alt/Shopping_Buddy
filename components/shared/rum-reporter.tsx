'use client'

import { useEffect } from 'react'
import { startLoadReport } from '@/lib/rum-client'

/** Starts the opt-in timing report of this page load (lib/rum-client.ts); renders nothing. */
export function RumReporter() {
  useEffect(() => {
    startLoadReport()
  }, [])
  return null
}
