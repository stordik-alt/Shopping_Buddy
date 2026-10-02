'use client'

import { useCallback, useEffect, useState } from 'react'
import { AI_ASSISTANT_ENABLED } from '@/lib/features'
import { safeLocalStorage } from '@/lib/safe-storage'
import { tabFromSlug, tabHref } from '@/lib/tab-url'
import { readThemeChoice, resolveDark, saveThemeChoice } from '@/lib/theme-preference'
import type { Tab } from '@/lib/types'

/** Light/dark mode: the remembered choice, else the system setting (lib/theme-preference.ts). */
export function useTheme() {
  // Starts light on the server render; the effect applies the remembered choice or the system
  // setting right after hydration.
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const storage = safeLocalStorage()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setDark(resolveDark(readThemeChoice(storage), media.matches))
    // Follow the system setting live, but only while the user has not chosen explicitly.
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readThemeChoice(safeLocalStorage()) === null) setDark(event.matches)
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    saveThemeChoice(safeLocalStorage(), next ? 'dark' : 'light')
  }

  return { dark, toggleDark }
}

/**
 * The open section, mirrored in the address. Switching sections records the section in the address,
 * so the phone's back gesture returns to the previous section instead of closing the app, and a
 * reload stays where the user was.
 */
export function useTabNavigation(initialTab: Tab) {
  const [tab, setTabState] = useState<Tab>(initialTab)
  const setTab = useCallback((next: Tab) => {
    setTabState(next)
    const href = tabHref(next)
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href)
  }, [])
  useEffect(() => {
    const onPopState = () => setTabState(tabFromSlug(new URLSearchParams(window.location.search).get('tab'), { aiEnabled: AI_ASSISTANT_ENABLED }))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  return { tab, setTab }
}

/**
 * The service worker (public/sw.js) keeps the last loaded page so the app opens without a signal,
 * and shows push notifications. Registered for everyone; push itself still needs the member's
 * permission (components/notifications/push-toggle.tsx).
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let active = true
    const hadController = Boolean(navigator.serviceWorker.controller)

    const reloadAfterUpdate = () => {
      if (!active) return
      window.location.reload()
    }

    // Register the controller-change listener before checking for an updated worker.
    // Otherwise a fast update can activate between registration.update() and listener setup,
    // leaving the current page on the old client bundle.
    if (hadController) {
      navigator.serviceWorker.addEventListener('controllerchange', reloadAfterUpdate)
    }

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (registration) => {
        if (!active) return
        // Check immediately after a deploy so an older worker cannot keep serving cached Next.js chunks.
        await registration.update()
      })
      .catch((error) => console.error('Service worker registration/update failed', error))

    return () => {
      active = false
      if (hadController) {
        navigator.serviceWorker.removeEventListener('controllerchange', reloadAfterUpdate)
      }
    }
  }, [])
}