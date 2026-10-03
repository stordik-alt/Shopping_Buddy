import { NextResponse } from 'next/server'

// Liveness check for an uptime monitor. This endpoint intentionally does not touch the database:
// frequent monitor requests must not wake a suspended Neon compute endpoint.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
