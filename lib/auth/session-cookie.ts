import { NEON_AUTH_SESSION_COOKIE_NAME } from '@neondatabase/auth/server'

/** Whether a request can carry a Neon Auth session at all. Without the session-token cookie there is
 *  no session to look up, so asking Neon Auth (which reads the session table in our Neon database)
 *  would only cost a round trip — for every anonymous visitor, crawler or link preview of the
 *  public home page. */
export function mayHaveNeonSession(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (name === NEON_AUTH_SESSION_COOKIE_NAME) return true
  return false
}

/** Whether `error` is Next.js refusing a cookie write during rendering (error E1180, "Cookies can only be
 *  modified in a Server Action or Route Handler"). Neon Auth's `getSession` writes the refreshed session
 *  cookies itself whenever its signed session cache has expired; called from a page render that write is
 *  refused, and the whole page fails with this error although the session itself is fine. */
export function isCookieWriteDuringRenderError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE === 'E1180'
}
