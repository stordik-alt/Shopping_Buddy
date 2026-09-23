import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ForbiddenError, requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Authorization for the `app/api/receipts/[id]/*` route handlers: resolves the signed-in user's
 *  household server-side (never from the request) and returns the receipt import only if that
 *  household owns it. proxy.ts already redirects signed-out requests, but that is not relied on
 *  here. Every "can't show you this" case — unknown id, malformed id, another household's import —
 *  is the same 404, so the routes can't be used to probe which import ids exist elsewhere. */
export async function loadOwnedReceiptImport(
  id: string,
): Promise<{ row: typeof schema.receiptImports.$inferSelect } | { response: NextResponse }> {
  let householdId: string
  try {
    householdId = await requireHouseholdId()
  } catch (error) {
    if (error instanceof ForbiddenError) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    throw error
  }

  // A non-UUID id would make Postgres throw on the uuid column; treat it as simply not found.
  if (!UUID_PATTERN.test(id)) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }

  const row = await getDb().query.receiptImports.findFirst({ where: eq(schema.receiptImports.id, id) })
  if (!row || row.householdId !== householdId) return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { row }
}
