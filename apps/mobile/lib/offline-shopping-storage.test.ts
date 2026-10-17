import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, string>())

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string

    constructor(parent: { uri: string } | string, name?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}/${name ?? ''}`
    }

    create() {}
  }

  class File {
    uri: string

    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`
    }

    get exists() {
      return files.has(this.uri)
    }

    async text() {
      const value = files.get(this.uri)
      if (value === undefined) throw new Error('missing file')
      return value
    }

    write(value: string) {
      files.set(this.uri, value)
    }

    delete() {
      files.delete(this.uri)
    }
  }

  return { Directory, File, Paths: { document: { uri: 'document://' } } }
})

import {
  clearLastOfflineContext,
  readLastOfflineContext,
  readOfflineSnapshot,
  saveLastOfflineContext,
  saveOfflineSnapshot,
} from './offline-shopping-storage'
import type { OfflineShoppingSnapshot } from './offline-shopping-list'

const snapshot: OfflineShoppingSnapshot = {
  version: 1,
  userId: 'user-1',
  householdId: 'household-1',
  list: { listId: 'list-1', shoppingLists: ['Nákup'], items: [] },
  pending: [],
}

describe('offline shopping storage', () => {
  beforeEach(() => files.clear())

  it('persists snapshots separately by user and household', async () => {
    await saveOfflineSnapshot(snapshot)

    await expect(readOfflineSnapshot('user-1', 'household-1')).resolves.toEqual(snapshot)
    await expect(readOfflineSnapshot('user-2', 'household-1')).resolves.toBeNull()
    await expect(readOfflineSnapshot('user-1', 'household-2')).resolves.toBeNull()
  })

  it('removes unreadable snapshots instead of trusting or replaying them', async () => {
    await saveOfflineSnapshot(snapshot)
    const storedPath = [...files.keys()][0]
    files.set(storedPath, '{broken')

    await expect(readOfflineSnapshot('user-1', 'household-1')).resolves.toBeNull()
    expect(files.has(storedPath)).toBe(false)
  })

  it('stores and clears the last authenticated context used to reopen a list offline', async () => {
    const context = { userId: 'user-1', householdId: 'household-1', userName: 'Anna' }
    await saveLastOfflineContext(context)
    await expect(readLastOfflineContext()).resolves.toEqual(context)

    await clearLastOfflineContext()
    await expect(readLastOfflineContext()).resolves.toBeNull()
  })
})
