import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { sanitizeRumEvent } from '@/lib/rum'

// Receives the timings one opted-in device measured (lib/rum-client.ts) and writes them to the server
// log as one `[rum]` line. Only works while PERF_TIMING=1 (the same switch as the page's `[perf]`
// lines, lib/perf-timing.ts) and only for a signed-in user; the body is cut down to known, bounded
// fields first (lib/rum.ts), so nothing a caller sends can flood or shape the log.
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 2048

export async function POST(request: Request) {
  if (process.env.PERF_TIMING !== '1') return new NextResponse(null, { status: 404 })
  const { data: session } = await auth.getSession()
  if (!session?.user) return new NextResponse(null, { status: 401 })

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const event = sanitizeRumEvent(body)
  if (!event) return new NextResponse(null, { status: 400 })

  console.log(`[rum] ${JSON.stringify(event)}`)
  return new NextResponse(null, { status: 204 })
}
