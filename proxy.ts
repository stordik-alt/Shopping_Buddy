import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'

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
  if (pathname.startsWith('/invite')) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicRoute(pathname)) {
    // A HEAD request (uptime monitors, link checkers) wants no body: answer it here instead of
    // rendering the home page, which would look up the session and, signed in, load the household.
    if (request.method === 'HEAD') return new NextResponse(null, { status: 200 })
    return NextResponse.next()
  }

  return protectRoutes(request)
}

// Public routes are now defined in `isPublicRoute()` to keep the allowlist centralized and easier to
// audit. The matcher still excludes cron, auth, health and static assets, but we default to protected
// access with explicit public exceptions.
export const config = {
  matcher: ['/((?!api/cron|_next/static|_next/image|favicon.ico).*)'],
}
