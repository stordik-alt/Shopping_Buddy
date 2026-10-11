// Real-user timing from one device (opt-in), for finding why the app feels slow on a phone where
// DevTools are not available. Pure parts only — the browser side is lib/rum-client.ts, the receiving
// route is app/api/perf/route.ts. Nothing is collected unless the device opted in with `?perf=1`.

export const RUM_STORAGE_KEY = 'anitka-rum'
/** The sign-in screen leaves how long signing in took here; the next app load reports it. */
export const RUM_LOGIN_KEY = 'anitka-rum-login-ms'

/** Whether this device reports timings: `?perf=1` turns it on (and the device remembers), `?perf=0`
 *  turns it off, otherwise what the device remembered. */
export function resolveRumFlag(search: string, stored: string | null): { enabled: boolean; remember: '1' | '0' | null } {
  const flag = new URLSearchParams(search).get('perf')
  if (flag === '1') return { enabled: true, remember: '1' }
  if (flag === '0') return { enabled: false, remember: '0' }
  return { enabled: stored === '1', remember: null }
}

/** `start`: a page opened on a device that reports (proof that the opt-in took effect). */
export type RumEvent = { type: 'load' | 'tab' | 'start'; [field: string]: string | number | boolean }

const MAX_MS = 10 * 60 * 1000
const MAX_FIELDS = 24
const TYPES = new Set(['load', 'tab', 'start'])

/** Keeps only what the log should hold: a known type, short strings, finite bounded numbers, booleans.
 *  The route is reachable by any signed-in user, so nothing from the body is trusted as-is. */
export function sanitizeRumEvent(input: unknown): RumEvent | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.length > MAX_FIELDS) return null
  const type = (input as Record<string, unknown>).type
  if (typeof type !== 'string' || !TYPES.has(type)) return null

  const clean: RumEvent = { type: type as RumEvent['type'] }
  for (const [key, value] of entries) {
    if (key === 'type' || !/^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(key)) continue
    if (typeof value === 'number' && Number.isFinite(value)) clean[key] = Math.max(-1, Math.min(MAX_MS, Math.round(value)))
    else if (typeof value === 'boolean') clean[key] = value
    else if (typeof value === 'string') clean[key] = value.slice(0, 80)
  }
  return clean
}
