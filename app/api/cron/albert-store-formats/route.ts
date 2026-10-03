import { NextResponse } from 'next/server'
import { syncAlbertStoreFormats } from '@/lib/db/store-directory'
import { invalidateStoreCaches } from '@/lib/db/cache-invalidation'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'

// Weekly, an hour after the OpenStreetMap store import (/api/cron/import-stores): moves the Albert
// branches that are hypermarkets — per albert.cz's own store pages — to the "Albert Hypermarket"
// chain, including branches that import just added (lib/stores/albert-formats.ts). Same auth model
// as the other crons: Vercel sends `Authorization: Bearer $CRON_SECRET`; proxy.ts excludes
// api/cron/* from session protection. ~90 store pages, read one after another with a pause.
export const maxDuration = 300

export async function GET(request: Request) {
  const rejected = rejectUnauthorizedCron(request)
  if (rejected) return rejected
  try {
    const report = await syncAlbertStoreFormats({ apply: true })
    invalidateStoreCaches()
    // The response body is not kept in the platform's logs; this line is.
    console.info(JSON.stringify({ event: 'albert_store_formats', ...report }))
    return NextResponse.json(report)
  } catch (err) {
    // albert.cz was unreachable or changed: nothing was moved, and the next run tries again.
    const message = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ event: 'albert_store_formats', error: message.slice(0, 500) }))
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
