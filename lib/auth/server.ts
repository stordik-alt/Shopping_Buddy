import { createNeonAuth } from '@neondatabase/auth/next/server'
import { extractNeonAuthCookies, NEON_AUTH_SERVER_PROXY_HEADER } from '@neondatabase/auth/server'
import { cookies, headers } from 'next/headers'
import type { NextRequest } from 'next/server'
import type { AppAuth } from '@/lib/auth/types'
import { isCookieWriteDuringRenderError, mayHaveNeonSession } from '@/lib/auth/session-cookie'
import { usesPgDriver } from '@/lib/db/local'

// Loaded on first use only, so production (Vercel, Cloudflare) never pulls in the pg driver.
const loadLocalAuth = async () => (await import('@/lib/auth/local')).localAuth

const lazyLocalAuth: AppAuth = {
  getSession: async () => (await loadLocalAuth()).getSession(),
  handler() {
    const forward = (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') => (request: NextRequest) =>
      loadLocalAuth().then((local) => local.handler()[method](request))
    return { GET: forward('GET'), POST: forward('POST'), PUT: forward('PUT'), DELETE: forward('DELETE'), PATCH: forward('PATCH') }
  },
  middleware: (options) => async (request) => (await loadLocalAuth()).middleware(options)(request),
}

// Single server-side auth instance: getSession, .handler() for the API route and .middleware() for
// proxy.ts route protection. Neon Auth in production; with a local DATABASE_URL (docs/10_LOCAL_DATABASE.md)
// a self-hosted Better Auth on the same neon_auth tables.
export const auth: AppAuth = usesPgDriver(process.env.DATABASE_URL) ? lazyLocalAuth : neonAuth()

function neonAuth(): AppAuth {
  const neon = createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  }) as unknown as AppAuth
  return {
    // Neon Auth's getSession asks its service whenever the signed session cache is missing — also for a
    // request with no session at all (an anonymous visitor, crawler or uptime check of the public home
    // page). Without the session-token cookie there is nothing to look up, so answer "signed out" here.
    getSession: async () => {
      if (!mayHaveNeonSession((await cookies()).getAll().map((cookie) => cookie.name))) return { data: null }
      try {
        return await neon.getSession()
      } catch (error) {
        // The signed session cache had expired and Neon Auth tried to write fresh cookies during the render,
        // which Next.js refuses. The session is still valid, so read it without writing; the browser's own
        // /api/auth/get-session call (a route handler, where cookies may be written) renews the cache.
        if (!isCookieWriteDuringRenderError(error)) throw error
        return readSessionWithoutWritingCookies()
      }
    },
    handler: () => neon.handler(),
    middleware: (options) => neon.middleware(options),
  }
}

/** The signed-in user, asked of the auth service with the visitor's own Neon Auth cookies and nothing
 *  written back. Used only when a render cannot set cookies (see `neonAuth().getSession`). A failed
 *  lookup is "signed out", as with an anonymous visitor, and is logged. */
async function readSessionWithoutWritingCookies(): Promise<Awaited<ReturnType<AppAuth['getSession']>>> {
  const baseUrl = process.env.NEON_AUTH_BASE_URL!
  const requestHeaders = await headers()
  const response = await fetch(new URL('get-session', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`), {
    headers: {
      Cookie: extractNeonAuthCookies(requestHeaders),
      // The same two headers Neon Auth's own server client sends with this call.
      Origin: requestHeaders.get('origin') || requestHeaders.get('referer')?.split('/').slice(0, 3).join('/') || '',
      [NEON_AUTH_SERVER_PROXY_HEADER]: 'nextjs',
    },
    cache: 'no-store',
  })
  if (!response.ok) {
    console.error('[auth] read-only session lookup failed with status', response.status)
    return { data: null }
  }
  const body = (await response.json()) as { user?: { id: string; email: string; name: string; emailVerified?: boolean } } | null
  return { data: body?.user ? { user: body.user } : null }
}
