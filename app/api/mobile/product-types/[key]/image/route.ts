import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { MobileRequestAuthError, mobileUserFromRequest } from '@/lib/auth/mobile-request'
import { getDb } from '@/lib/db/client'
import * as schema from '@/lib/db/schema'
import { r2GetObject } from '@/lib/storage/r2'

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await mobileUserFromRequest(request)
  } catch (error) {
    if (error instanceof MobileRequestAuthError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    throw error
  }

  const { key } = await params
  if (!/^[a-z0-9-]{1,100}$/i.test(key)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const row = await getDb().query.productTypes.findFirst({
      where: eq(schema.productTypes.key, key),
      columns: { imageRef: true },
    })
    if (!row?.imageRef) return new Response(null, { status: 404 })

    const file = await r2GetObject(row.imageRef)
    if (!file) return new Response(null, { status: 404 })

    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType || 'image/webp',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[mobile product image]', error)
    return NextResponse.json({ error: 'request_failed' }, { status: 500 })
  }
}
