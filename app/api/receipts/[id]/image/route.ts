import { NextResponse } from 'next/server'
import { loadOwnedReceiptImport } from '@/lib/receipt-access'
import { getReceiptFile } from '@/lib/storage'

// Streams a household's own uploaded receipt photo/PDF back to the review UI
// (docs/08_OCR_RECEIPT_PIPELINE.md section 14: the reviewer must see the original next to the
// recognized values). The file is stored privately (Vercel Blob or R2, lib/storage) — its storage
// address is not fetchable by a browser — so this route is the only way it reaches a client, and
// access is decided server-side (see loadOwnedReceiptImport).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owned = await loadOwnedReceiptImport(id)
  if ('response' in owned) return owned.response
  const { row } = owned

  if (!row.imageUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const file = await getReceiptFile(row.imageUrl)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new Response(file.body, {
    headers: {
      // Content type was restricted to an allowlist (JPEG/PNG/WebP/HEIC/PDF) at upload time.
      'Content-Type': file.contentType,
      'X-Content-Type-Options': 'nosniff',
      // Personal financial data: never let a shared cache keep it.
      'Cache-Control': 'private, no-store',
    },
  })
}
