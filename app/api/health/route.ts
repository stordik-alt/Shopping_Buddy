import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { describeError } from '@/lib/errors'

// Liveness check for an uptime monitor: 200 when the app is up and the database answers, 503 when it
// does not. Public on purpose (a monitor has no session), so the body says nothing about the system
// beyond ok/not ok; the reason for a failure goes to the server log only.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await getDb().execute(sql`select 1`)
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error(JSON.stringify({ event: 'health.failed', error: describeError(error) }))
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
