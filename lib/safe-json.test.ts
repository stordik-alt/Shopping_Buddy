import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseStoredJson } from '@/lib/safe-json'

describe('parseStoredJson', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the parsed value', () => {
    expect(parseStoredJson<{ a: number }>('{"a":1}', 'test')).toEqual({ a: 1 })
  })

  it('returns null and logs, instead of throwing, for damaged JSON', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(parseStoredJson('{"a":', 'receipt_imports.items abc')).toBeNull()
    expect(log).toHaveBeenCalledOnce()
    expect(String(log.mock.calls[0][0])).toContain('receipt_imports.items abc')
  })
})
