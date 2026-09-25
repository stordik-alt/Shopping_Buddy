import { describe, expect, it } from 'vitest'
import { readThemeChoice, resolveDark, saveThemeChoice, THEME_STORAGE_KEY } from '@/lib/theme-preference'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('theme preference', () => {
  it('follows the system when nothing was chosen', () => {
    expect(resolveDark(null, true)).toBe(true)
    expect(resolveDark(null, false)).toBe(false)
  })

  it('lets an explicit choice win over the system', () => {
    expect(resolveDark('light', true)).toBe(false)
    expect(resolveDark('dark', false)).toBe(true)
  })

  it('stores and reads back the choice', () => {
    const storage = memoryStorage()
    saveThemeChoice(storage, 'dark')
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark')
    expect(readThemeChoice(storage)).toBe('dark')
  })

  it('ignores a stored value it does not know', () => {
    expect(readThemeChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'sepia' }))).toBeNull()
  })

  it('falls back to the system when storage is missing or throws', () => {
    expect(readThemeChoice(undefined)).toBeNull()
    expect(readThemeChoice(throwingStorage)).toBeNull()
    expect(() => saveThemeChoice(throwingStorage, 'dark')).not.toThrow()
  })
})
