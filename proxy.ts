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
  if (pathname === '/' || pathname === '/intro' || pathname.startsWith('/intro/')) {
    // A HEAD request (uptime monitors, link checkers) wants no body: answer it here instead of
    // rendering the home page, which would look up the session and, signed in, load the household.
    if (request.method === 'HEAD') return new NextResponse(null, { status: 200 })
    return NextResponse.next()
  }

  return protectRoutes(request)
}

// brand/ holds the public Buddy images (public/brand) shown on the sign-in and sign-up pages
// before anyone is signed in, and the installed app's icons. manifest.webmanifest (app/manifest.ts)
// must be public too: browsers fetch it without cookies, so behind sign-in it would never load. The
// same goes for sw.js, the push-notification service worker (public/sw.js). api/health is the uptime
// monitor's check, which has no session either.
export const config = {
  matcher: ['/((?!api/auth|api/cron|api/health|auth/|invite/|intro/|brand/|manifest.webmanifest|sw.js|_next/static|_next/image|favicon.ico).*)'],
}
