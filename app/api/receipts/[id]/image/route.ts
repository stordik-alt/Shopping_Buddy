import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { loadOwnedReceiptImport } from '@/lib/receipt-access'

// Streams a household's own uploaded receipt photo/PDF back to the review UI
// (docs/08_OCR_RECEIPT_PIPELINE.md section 14: the reviewer must see the original next to the
// recognized values). The blob is stored with `access: 'private'` — its URL is not fetchable by a
// browser — so this route is the only way it reaches a client, and access is decided server-side
// (see loadOwnedReceiptImport).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owned = await loadOwnedReceiptImport(id)
  if ('response' in owned) return owned.response
  const { row } = owned

  if (!row.imageUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await get(row.imageUrl, { access: 'private' })
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new Response(result.stream, {
    headers: {
      // Content type was restricted to an allowlist (JPEG/PNG/WebP/HEIC/PDF) at upload time.
      'Content-Type': result.blob.contentType,
      'X-Content-Type-Options': 'nosniff',
      // Personal financial data: never let a shared cache keep it.
      'Cache-Control': 'private, no-store',
    },
  })
}
