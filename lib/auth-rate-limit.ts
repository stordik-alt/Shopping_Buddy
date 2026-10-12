// Limits on sign-up and sign-in (docs/37_SECURITY_REMEDIATION_PLAN.md, V8). Registration used to be open to
// any number of requests: every new account gets a household and with it the daily quota of paid receipt
// reading, and the sign-in form is a brute-force target. The auth service itself is a managed one whose
// own limits cannot be seen from this repository, so these hold here regardless of its configuration.

export type AuthLimit = { name: string; max: number; windowMs: number }

const HOUR = 60 * 60 * 1000

/** The limit that applies to an auth request, or null when the request is not limited. */
export function authLimitFor(method: string, pathname: string): AuthLimit | null {
  if (method !== 'POST') return null
  if (pathname.endsWith('/sign-up/email')) return { name: 'signup', max: 5, windowMs: HOUR }
  if (pathname.endsWith('/sign-in/email')) return { name: 'signin', max: 30, windowMs: 10 * 60 * 1000 }
  return null
}

/** The caller's address as the hosting platform reports it (Vercel sets `x-forwarded-for` itself and
 *  discards what the client sent). Null when there is none, e.g. a local run: the request is then not limited
 *  rather than all such requests sharing one counter. */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || null
}
