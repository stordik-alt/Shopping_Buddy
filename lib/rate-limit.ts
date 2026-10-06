export const RATE_LIMIT_WINDOW_MS = 60_000
export const RATE_LIMIT_MAX_REQUESTS = 5

const inviteBuckets = new Map<string, { count: number; resetAt: number }>()

export function checkInviteRateLimit(key: string, maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS): void {
  const now = Date.now()
  const current = inviteBuckets.get(key)

  if (!current || current.resetAt <= now) {
    inviteBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  if (current.count >= maxRequests) {
    throw new Error('Příliš mnoho pozvánek za krátkou dobu. Zkuste to prosím později.')
  }

  inviteBuckets.set(key, { count: current.count + 1, resetAt: current.resetAt })
}

