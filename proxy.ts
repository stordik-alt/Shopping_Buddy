import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { buildCsp, cspHeaderName, newNonce } from '@/lib/csp'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// The public root must reach app/page.tsx so it can route unauthenticated
// visitors through the Buddy intro before the login screen.
const protectRoutes = auth.middleware({ loginUrl: '/auth/sign-in' })

export function isPublicRoute(pathname: string): boolean {
  if (pathname === '/' || pathname === '/intro' || pathname.startsWith('/intro/')) return true
  if (pathname === '/manifest.webmanifest') return true
  if (pathname === '/sw.js') return true
  if (pathname.startsWith('/brand/')) return true
  if (pathname.startsWith('/api/health')) return true
  if (pathname.startsWith('/api/auth')) return true
  if (pathname === '/api/mobile/me') return true
  if (pathname.startsWith('/invite')) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // A HEAD request (uptime monitors, link checkers) wants no body: answer it here instead of
  // rendering the home page, which would look up the session and, signed in, load the household.
  if (isPublicRoute(pathname) && request.method === 'HEAD') return new NextResponse(null, { status: 200 })

  // Content-Security-Policy with a per-request nonce (lib/csp.ts). Next.js reads the policy from the
  // *request* headers while rendering to put the nonce on its scripts, so they are set there as well.
  const nonce = newNonce()
  const policy = buildCsp(nonce, { isDev: process.env.NODE_ENV === 'development' })
  const headerName = cspHeaderName(process.env.CSP_ENFORCE === '1')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(headerName, policy)

  const withPolicy = (response: NextResponse) => {
    response.headers.set(headerName, policy)
    return response
  }
  const next = () => withPolicy(NextResponse.next({ request: { headers: requestHeaders } }))

  if (isPublicRoute(pathname)) return next()

  const guarded = await protectRoutes(request)
  // Not a pass-through (a redirect to sign-in, or an auth response): only the policy is added.
  if (guarded.headers.get('x-middleware-next') !== '1') return withPolicy(guarded)
  // Passed: render with the nonce'd request headers, keeping whatever the auth layer set (refreshed cookies).
  const response = next()
  for (const [key, value] of guarded.headers) {
    if (key.toLowerCase() !== 'set-cookie' && !key.toLowerCase().startsWith('x-middleware-')) response.headers.set(key, value)
  }
  for (const cookie of guarded.headers.getSetCookie()) response.headers.append('set-cookie', cookie)
  return response
}

// Public routes are now defined in `isPublicRoute()` to keep the allowlist centralized and easier to
// audit. The matcher still excludes cron, auth, health and static assets, but we default to protected
// access with explicit public exceptions.
export const config = {
  matcher: ['/((?!api/cron|_next/static|_next/image|favicon.ico).*)'],
}
