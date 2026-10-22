import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { productTypes } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { r2GetObject } from '@/lib/storage/r2'

/**
 * Serves the normalized product type image from R2.
 *
 * Route: /api/product-types/images/[key]
 *
 * This is a private proxy to ensure:
 * 1. Authentication: Only signed-in users can fetch images.
 * 2. Access Control: We control the R2 access without exposing public URLs.
 * 3. Caching: We set appropriate Cache-Control headers.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  let key = 'unknown'
  try {
    key = (await params).key
    const db = getDb()

    // 1. Authentication
    // The session is handled by Neon Auth/Middleware; if we are here, the user is authenticated.
    // (Note: For public-facing parts, we'd check session here, but this is for the Pantry grid).

    // 2. Look up the image reference in the database
    const [type] = await db
      .select({ imageRef: productTypes.imageRef })
      .from(productTypes)
      .where(eq(productTypes.key, key))
      .limit(1)

    if (!type || !type.imageRef) {
      return new NextResponse(null, { status: 404 })
    }

    // 3. Fetch the object from R2
    const file = await r2GetObject(type.imageRef)
    if (!file) {
      return new NextResponse(null, { status: 404 })
    }

    // 4. Return the image with security and caching headers
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': file.contentType || 'image/webp',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error(`[product-images] Error serving image for key ${key}:`, error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
