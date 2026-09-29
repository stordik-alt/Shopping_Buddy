'use server'

import { requireAdmin } from '@/lib/auth/authorize'
import { decideCategoryChange } from '@/lib/db/category-changes'

/** Approves (applies to the shared catalog) or rejects one pending category proposal; either way the
 *  product's category is locked afterwards. The check is on the server, never from the request. */
export async function decideCategoryChangeAction(changeId: string, approve: boolean): Promise<void> {
  const { userId } = await requireAdmin()
  if (typeof changeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(changeId)) throw new Error('Neplatný návrh.')
  const decided = await decideCategoryChange(changeId, approve, userId)
  if (!decided) throw new Error('Návrh už byl vyřízen.')
}
