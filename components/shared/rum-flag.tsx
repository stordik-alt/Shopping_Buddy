'use client'

import { useEffect } from 'react'
import { reportRum, rumEnabled } from '@/lib/rum-client'

/** Picks up `?perf=1` on whichever page the device opens first (intro, sign-in or the app), so the
 *  opt-in is remembered even if the person never signs in again; a device that reports sends one
 *  `start` event per page open. Renders nothing. */
export function RumFlag() {
  useEffect(() => {
    if (rumEnabled()) reportRum({ type: 'start', path: window.location.pathname })
  }, [])
  return null
}
