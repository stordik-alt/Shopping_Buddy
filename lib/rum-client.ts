import { safeLocalStorage } from '@/lib/safe-storage'
import { RUM_LOGIN_KEY, RUM_STORAGE_KEY, resolveRumFlag, type RumEvent } from '@/lib/rum'

// Browser side of lib/rum.ts: measures how long the app takes on this device and posts it to
// /api/perf, which writes one `[rum]` line to the server log. Does nothing unless the device opted in.

let enabled: boolean | undefined

/** Whether this device reports timings; reads the address and the remembered choice once. */
export function rumEnabled(): boolean {
  if (typeof window === 'undefined') return false
  if (enabled === undefined) {
    const storage = safeLocalStorage()
    const decision = resolveRumFlag(window.location.search, storage?.getItem(RUM_STORAGE_KEY) ?? null)
    if (decision.remember) storage?.setItem(RUM_STORAGE_KEY, decision.remember)
    enabled = decision.enabled
  }
  return enabled
}

export function reportRum(event: RumEvent) {
  if (!rumEnabled() || typeof navigator.sendBeacon !== 'function') return
  navigator.sendBeacon('/api/perf', new Blob([JSON.stringify(event)], { type: 'application/json' }))
}

/** The sign-in screen: how long signing in took, kept for the next app load to report. */
export function rememberLoginTiming(signInMs: number) {
  if (rumEnabled()) safeLocalStorage()?.setItem(RUM_LOGIN_KEY, String(Math.round(signInMs)))
}

let loadReportStarted = false

type NetworkInformation ={ effectiveType?: string; rtt?: number; downlink?: number }

/** One `load` event a few seconds after the page opened: how the document and its files arrived and
 *  how busy the main thread was meanwhile. */
export function startLoadReport() {
  // Once per page load, even if the component mounts twice (React strict mode in development).
  if (!rumEnabled() || loadReportStarted) return
  loadReportStarted = true
  let blockingMs = 0
  let longTasks = 0
  let lcpMs = 0
  const observers: PerformanceObserver[] = []
  const observe = (type: string, onEntry: (entry: PerformanceEntry) => void) => {
    try {
      const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry))
      observer.observe({ type, buffered: true })
      observers.push(observer)
    } catch {
      // The browser does not support this entry type; that metric is simply left out.
    }
  }
  observe('longtask', (entry) => {
    longTasks += 1
    blockingMs += Math.max(0, entry.duration - 50)
  })
  observe('largest-contentful-paint', (entry) => {
    lcpMs = entry.startTime
  })

  window.setTimeout(() => {
    observers.forEach((observer) => observer.disconnect())
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paint = performance.getEntriesByName('first-contentful-paint')[0]
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
    const storage = safeLocalStorage()
    const signInMs = Number(storage?.getItem(RUM_LOGIN_KEY))
    storage?.removeItem(RUM_LOGIN_KEY)
    reportRum({
      type: 'load',
      ttfbMs: navigation?.responseStart ?? -1,
      dclMs: navigation?.domContentLoadedEventEnd ?? -1,
      loadMs: navigation?.loadEventEnd ?? -1,
      fcpMs: paint?.startTime ?? -1,
      lcpMs: lcpMs || -1,
      blockingMs,
      longTasks,
      docKB: Math.round((navigation?.transferSize ?? 0) / 1024),
      resourceKB: Math.round(resources.reduce((sum, entry) => sum + entry.transferSize, 0) / 1024),
      resources: resources.length,
      signInMs: Number.isFinite(signInMs) && signInMs > 0 ? signInMs : -1,
      net: connection?.effectiveType ?? '',
      rttMs: connection?.rtt ?? -1,
      downMbps: connection?.downlink ?? -1,
      cores: navigator.hardwareConcurrency ?? -1,
      ua: navigator.userAgent.slice(0, 80),
    })
  }, 6000)
}

const visitedTabs = new Set<string>()

/** How long a section took to appear after the tap: until its loading placeholder is gone and the
 *  browser has painted twice. `first` tells a first visit (its code still has to be fetched). */
export function trackTabSwitch(tab: string) {
  if (!rumEnabled()) return
  const first = !visitedTabs.has(tab)
  visitedTabs.add(tab)
  const start = performance.now()
  let frames = 0
  const tick = () => {
    frames += 1
    const loading = [...document.querySelectorAll('[role=status]')].some((element) => element.textContent?.trim() === 'Načítám…')
    if (frames > 2 && !loading) {
      reportRum({ type: 'tab', tab, ms: performance.now() - start, first })
    } else if (performance.now() - start > 20000) {
      reportRum({ type: 'tab', tab, ms: -1, first })
    } else {
      requestAnimationFrame(tick)
    }
  }
  requestAnimationFrame(tick)
}
