'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// "Keep the screen on" while shopping: the list stays visible between shelves without unlocking the
// phone. Uses the Screen Wake Lock API (Chrome/Edge/Samsung Internet on Android, Safari 16.4+).
// The browser drops the lock whenever the page is hidden, so it is re-requested when the page
// becomes visible again while the user still wants it. Unsupported browsers hide the toggle.

export function useWakeLock() {
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)
  const wanted = useRef(false)
  const sentinel = useRef<WakeLockSentinel | null>(null)

  const acquire = useCallback(async () => {
    try {
      const lock = await navigator.wakeLock.request('screen')
      sentinel.current = lock
      setActive(true)
      lock.addEventListener('release', () => {
        if (sentinel.current === lock) sentinel.current = null
        setActive(false)
      })
    } catch (error) {
      // Refused (battery saver, no user gesture, not visible): report it, keep the app usable.
      console.warn(JSON.stringify({ event: 'wake_lock_failed', error: error instanceof Error ? error.message : String(error) }))
      setActive(false)
    }
  }, [])

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wanted.current && !sentinel.current) void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      wanted.current = false
      void sentinel.current?.release()
    }
  }, [acquire])

  const toggle = useCallback(() => {
    if (wanted.current) {
      wanted.current = false
      void sentinel.current?.release()
      sentinel.current = null
      setActive(false)
    } else {
      wanted.current = true
      void acquire()
    }
  }, [acquire])

  return { supported, active, toggle }
}
