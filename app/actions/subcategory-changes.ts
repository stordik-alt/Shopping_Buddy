'use server'

import { requireAdmin } from '@/lib/auth/authorize'
import { decideSubcategoryChange } from '@/lib/db/subcategory-changes'

// Administrators decide the catalog subcategory moves that waited for approval
// (lib/product-subcategory-changes.ts). The check is on the server, never from the request.

/** Approves (applies to the shared catalog) or rejects one pending proposal. */
export async function decideSubcategoryChangeAction(changeId: string, approve: boolean): Promise<void> {
  const { userId } = await requireAdmin()
  if (typeof changeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(changeId)) throw new Error('Neplatný návrh.')
  const decided = await decideSubcategoryChange(changeId, approve, userId)
  if (!decided) throw new Error('Návrh už byl vyřízen.')
}
