import { createNeonAuth } from '@neondatabase/auth/next/server'
import type { NextRequest } from 'next/server'
import type { AppAuth } from '@/lib/auth/types'
import { isLocalDatabaseUrl } from '@/lib/db/local'

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
export const auth: AppAuth = isLocalDatabaseUrl(process.env.DATABASE_URL)
  ? lazyLocalAuth
  : (createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    }) as unknown as AppAuth)
