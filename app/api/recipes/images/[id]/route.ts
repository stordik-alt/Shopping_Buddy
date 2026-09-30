import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { r2GetObject } from '@/lib/storage/r2'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireHouseholdId()
  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const row = await getDb()
    .select({ imageRef: schema.recipeCatalog.imageRef })
    .from(schema.recipeCatalog)
    .where(eq(schema.recipeCatalog.id, id))
    .limit(1)
    .then(([value]) => value)

  if (!row?.imageRef?.startsWith('r2:')) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await r2GetObject(row.imageRef.slice(3))
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
