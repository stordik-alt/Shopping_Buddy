import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { applyRetention } from '@/lib/db/retention'
import { safeErrorMessage } from '@/lib/errors'

// Weekly clean-up of personal data that is no longer needed (lib/retention.ts has the periods).
// Same auth model as the other app/api/cron routes.
export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request)
  if (rejected) return rejected
  try {
    return NextResponse.json(await applyRetention())
  } catch (error) {
    console.error('[cron] retention failed:', safeErrorMessage(error))
    return NextResponse.json({ error: 'Retention failed' }, { status: 500 })
  }
}
