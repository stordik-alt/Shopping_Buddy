import { headers } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { betterAuth } from 'better-auth'
import { getSessionCookie } from 'better-auth/cookies'
import { nextCookies } from 'better-auth/next-js'
import { Pool } from 'pg'
import { poolMax } from '@/lib/db/local'
import type { AppAuth } from '@/lib/auth/types'

// Self-hosted Better Auth — the engine Neon Auth runs managed — for a local PostgreSQL where Neon
// Auth is not available. It reads and writes the same neon_auth tables (created by
// lib/db/local-auth-schema.sql), so the rest of the app cannot tell the difference.
const globalPool = globalThis as unknown as { __shoppingBuddyAuthPool?: Pool }

function createLocalBetterAuth() {
  globalPool.__shoppingBuddyAuthPool ??= new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: poolMax(),
    // Better Auth addresses tables as "user", "session", … without a schema, so put neon_auth on the path.
    options: '-c search_path=neon_auth',
  })
  return betterAuth({
    database: globalPool.__shoppingBuddyAuthPool,
    secret: process.env.NEON_AUTH_COOKIE_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    emailAndPassword: { enabled: true, autoSignIn: true },
    // household_members.user_id and app_admins.user_id are uuid columns that reference neon_auth."user"(id).
    advanced: { database: { generateId: 'uuid' } },
    plugins: [nextCookies()],
  })
}

let instance: ReturnType<typeof createLocalBetterAuth> | null = null
const betterAuthInstance = () => (instance ??= createLocalBetterAuth())

export const localAuth: AppAuth = {
  async getSession() {
    const session = await betterAuthInstance().api.getSession({ headers: await headers() })
    return { data: session }
  },
  handler() {
    const handle = (request: Request) => betterAuthInstance().handler(request)
    return { GET: handle, POST: handle, PUT: handle, DELETE: handle, PATCH: handle }
  },
  middleware({ loginUrl }) {
    // Only presence of the session cookie is checked here (Better Auth's documented proxy pattern);
    // the real session lookup happens server-side in requireHousehold() for every action and page.
    return (request: NextRequest) => (getSessionCookie(request) ? NextResponse.next() : NextResponse.redirect(new URL(loginUrl, request.url)))
  },
}
