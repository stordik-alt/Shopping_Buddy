import { NextResponse } from 'next/server'
import { loadOwnedReceiptImport } from '@/lib/receipt-access'

// Lightweight status read used to show real progress while `processUploadedReceiptAction` runs the
// OCR pipeline (docs/08_OCR_RECEIPT_PIPELINE.md section 20). It is a route handler rather than a
// Server Action on purpose: Next.js runs a client's Server Actions one at a time, so a status action
// would just queue behind the long-running processing action it is meant to report on.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const owned = await loadOwnedReceiptImport(id)
  if ('response' in owned) return owned.response

  return NextResponse.json({ status: owned.row.status }, { headers: { 'Cache-Control': 'private, no-store' } })
}
