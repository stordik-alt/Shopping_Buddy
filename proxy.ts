import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'

// Next.js 16 route-protection entry point (successor to middleware.ts).
// The public root must reach app/page.tsx so it can route unauthenticated
// visitors through the Buddy intro before the login screen.
const protectRoutes = auth.middleware({ loginUrl: '/auth/sign-in' })

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Keep the landing route public. app/page.tsx decides whether the user
  // should enter the app or see the intro first.
  if (pathname === '/') {
    return NextResponse.next()
  }

  return protectRoutes(request)
}

export const config = {
  matcher: ['/((?!api/auth|api/cron|auth/|invite/|intro/|_next/static|_next/image|favicon.ico).*)'],
}
