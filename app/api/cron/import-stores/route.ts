import { NextResponse } from 'next/server'
import { importOsmStores } from '@/lib/db/store-directory'

// Weekly refresh of the store chains' branches from OpenStreetMap (lib/db/store-directory.ts):
// new branches appear, moved or re-timed ones follow the map; nothing is deleted. Same auth model as
// the other crons: Vercel sends `Authorization: Bearer $CRON_SECRET`; proxy.ts excludes api/cron/*
// from session protection. The Overpass query can take a couple of minutes.
export const maxDuration = 300

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // No new map query starts after 150 s: one query can take up to ~105 s more, and the writes
    // need the rest of the 300 s limit. Chains not reached are reported and retried next week.
    const report = await importOsmStores({ apply: true, deadline: Date.now() + 150_000 })
    // The response body is not kept in the platform's logs; this line is.
    console.info(JSON.stringify({ event: 'store_import', ...report }))
    return NextResponse.json(report)
  } catch (err) {
    // The source was unreachable or answered with incomplete data: nothing was written, the existing
    // branches stay as they are, and the next run tries again.
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ event: 'store_import', error: message.slice(0, 500) }))
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
