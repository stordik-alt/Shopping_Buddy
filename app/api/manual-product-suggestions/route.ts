import { NextResponse } from 'next/server'
import { requireHouseholdId } from '@/lib/auth/authorize'
import { searchManualProductSuggestions } from '@/lib/manual-product-suggestions'

export async function GET(request: Request) {
  await requireHouseholdId()
  const query = new URL(request.url).searchParams.get('q') ?? ''
  return NextResponse.json(await searchManualProductSuggestions(query))
}
