import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDeviceDataOnSignOut, clearOfflineQueues, clearPageCache, PAGE_CACHE_NAME } from '@/lib/device-cleanup'
import { STORAGE_PREFIX } from '@/lib/offline-queue'

function fakeStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
  }
}

describe('device cleanup on sign-out', () => {
  afterEach(() => vi.restoreAllMocks())

  it('removes the offline queue of every household and nothing else', () => {
    const storage = fakeStorage({ [`${STORAGE_PREFIX}household-a`]: '[]', [`${STORAGE_PREFIX}household-b`]: '[]', theme: 'dark' })
    expect(clearOfflineQueues(storage)).toBe(2)
    expect([...storage.map.keys()]).toEqual(['theme'])
    expect(clearOfflineQueues(undefined)).toBe(0)
  })

  it('deletes the offline page cache', async () => {
    const del = vi.fn().mockResolvedValue(true)
    expect(await clearPageCache({ delete: del })).toBe(true)
    expect(del).toHaveBeenCalledWith(PAGE_CACHE_NAME)
    expect(await clearPageCache(undefined)).toBe(true)
  })

  it('reports a failure instead of throwing, and still clears the queue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const storage = fakeStorage({ [`${STORAGE_PREFIX}household-a`]: '[]' })
    const result = await clearDeviceDataOnSignOut(storage, { delete: () => Promise.reject(new Error('blocked')) })
    expect(result).toEqual({ pageCacheCleared: false, queuesCleared: true })
    expect(storage.map.size).toBe(0)
  })

  it('reports a queue that cannot be cleared and still deletes the page cache', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const del = vi.fn().mockResolvedValue(true)
    const storage = { length: 1, key: () => `${STORAGE_PREFIX}x`, removeItem: () => { throw new Error('denied') } }
    expect(await clearDeviceDataOnSignOut(storage, { delete: del })).toEqual({ pageCacheCleared: true, queuesCleared: false })
    expect(del).toHaveBeenCalled()
  })
})
