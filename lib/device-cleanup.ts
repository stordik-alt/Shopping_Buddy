import { STORAGE_PREFIX } from '@/lib/offline-queue'

// What the app leaves on a device that belongs to the signed-in account, and is removed on sign-out
// (docs/35_SECURITY_AUDIT.md, S11 and S12): the service worker's copy of the app page (public/sw.js) and
// the offline queue of waiting shopping changes (lib/offline-queue.ts). On a shared phone the next person
// must neither open the offline page of the previous account nor see its item names and prices.

export const PAGE_CACHE_NAME = 'shopping-buddy-page-v1'

/** Removes every offline-queue entry of every household from `storage`; returns how many were removed.
 *  Entries are found by key prefix, because the household of the account that signs out is not the only
 *  one a shared device may have stored. Other keys are left alone. */
export function clearOfflineQueues(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined): number {
  if (!storage) return 0
  const keys: string[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key !== null && key.startsWith(STORAGE_PREFIX)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
  return keys.length
}

/** Deletes the offline copy of the app page. Resolves to whether it succeeded; a missing cache counts as
 *  success (nothing to delete). A failure is returned, not thrown, so signing out is never blocked by it. */
export async function clearPageCache(cacheStorage: Pick<CacheStorage, 'delete'> | undefined): Promise<boolean> {
  if (!cacheStorage) return true
  try {
    await cacheStorage.delete(PAGE_CACHE_NAME)
    return true
  } catch (error) {
    console.error('Could not clear the offline page cache', error)
    return false
  }
}

/** Everything the device keeps for the signed-in account. Never throws; reports what it could not clear. */
export async function clearDeviceDataOnSignOut(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined,
  cacheStorage: Pick<CacheStorage, 'delete'> | undefined,
): Promise<{ pageCacheCleared: boolean; queuesCleared: boolean }> {
  let queuesCleared = true
  try {
    clearOfflineQueues(storage)
  } catch (error) {
    console.error('Could not clear the offline queue', error)
    queuesCleared = false
  }
  return { pageCacheCleared: await clearPageCache(cacheStorage), queuesCleared }
}
