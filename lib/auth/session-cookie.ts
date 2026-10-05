import { NEON_AUTH_SESSION_COOKIE_NAME } from '@neondatabase/auth/server'

/** Whether a request can carry a Neon Auth session at all. Without the session-token cookie there is
 *  no session to look up, so asking Neon Auth (which reads the session table in our Neon database)
 *  would only cost a round trip — for every anonymous visitor, crawler or link preview of the
 *  public home page. */
export function mayHaveNeonSession(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (name === NEON_AUTH_SESSION_COOKIE_NAME) return true
  return false
}
