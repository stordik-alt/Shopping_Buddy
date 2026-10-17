import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { mobileHouseholdForUser, mobileUserFromRequest, MobileRequestAuthError } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { r2GetObject } from '@/lib/storage/r2'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECIPE_IMAGE_KEY_PATTERN = /^recipe-images\/[a-z0-9-]+\/[a-f0-9]{64}\.webp$/i

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.has('authorization')) {
    try {
      const user = await mobileUserFromRequest(request)
      const member = await mobileHouseholdForUser(user.id)
      if (!member) return NextResponse.json({ error: 'household_required' }, { status: 409 })
    } catch (error) {
      if (error instanceof MobileRequestAuthError) {
        return NextResponse.json({ error: error.code }, { status: error.status })
      }
      throw error
    }
  } else {
    await requireHouseholdId()
  }

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const row = await getDb()
    .select({ imageRef: schema.recipeCatalog.imageRef })
    .from(schema.recipeCatalog)
    .where(eq(schema.recipeCatalog.id, id))
    .limit(1)
    .then(([value]) => value)

  if (!row?.imageRef?.startsWith('r2:')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const key = row.imageRef.slice(3)
  if (!RECIPE_IMAGE_KEY_PATTERN.test(key)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await r2GetObject(key)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
