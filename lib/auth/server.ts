import { createNeonAuth } from '@neondatabase/auth/next/server'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import type { AppAuth } from '@/lib/auth/types'
import { mayHaveNeonSession } from '@/lib/auth/session-cookie'
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
    getSession: async () => (mayHaveNeonSession((await cookies()).getAll().map((cookie) => cookie.name)) ? neon.getSession() : { data: null }),
    handler: () => neon.handler(),
    middleware: (options) => neon.middleware(options),
  }
}
