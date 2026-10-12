import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth/server'
import { authLimitFor, clientAddress } from '@/lib/auth-rate-limit'
import { hitRateLimit } from '@/lib/db/rate-limit'

const handler = auth.handler()
export const { GET, PUT, DELETE, PATCH } = handler

type RouteContext = Parameters<typeof handler.POST> extends [unknown, ...infer Rest] ? Rest : never

// Sign-up and sign-in are counted per address before the request reaches the auth service (lib/auth-rate-limit.ts).
export async function POST(request: NextRequest, ...context: RouteContext) {
  const limit = authLimitFor(request.method, new URL(request.url).pathname)
  const address = limit ? clientAddress(request.headers) : null
  if (limit && address) {
    try {
      const { allowed } = await hitRateLimit(`${limit.name}:${address}`, limit)
      // 429 with the code and wording the sign-in forms already translate (lib/auth/auth-errors.ts).
      if (!allowed) return NextResponse.json({ code: 'over_request_rate_limit', message: 'Too many requests, try again later' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.windowMs / 1000)) } })
    } catch (error) {
      // The counter being unreachable must not lock everyone out of signing in; the failure is logged instead.
      console.error('[auth-rate-limit]', error)
    }
  }
  return (handler.POST as (request: NextRequest, ...context: RouteContext) => Promise<Response>)(request, ...context)
}
