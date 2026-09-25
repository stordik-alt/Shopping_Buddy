'use server'

import { requireHousehold } from '@/lib/auth/authorize'
import { getStoreProductNames } from '@/lib/db/queries'

// The store directory's branch detail: product names with a price at that branch, loaded when the
// detail is opened instead of with every page render (lib/db/queries.ts getStores). Store data is
// global, so signing in is the only requirement.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function storeProductNamesAction(storeLocationId: string): Promise<string[]> {
  await requireHousehold()
  if (typeof storeLocationId !== 'string' || !UUID.test(storeLocationId)) throw new Error('Neplatná prodejna.')
  return getStoreProductNames(storeLocationId)
}
