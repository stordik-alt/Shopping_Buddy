import { describe, expect, it } from 'vitest'
import { inPart, partLabel, stableHash } from '@/lib/ingestion/parts'

describe('stableHash', () => {
  it('is the same for the same text on every call', () => {
    expect(stableHash('mlecne-vyrobky')).toBe(stableHash('mlecne-vyrobky'))
    expect(stableHash('a')).not.toBe(stableHash('b'))
  })

  it('matches the FNV-1a reference values', () => {
    expect(stableHash('')).toBe(0x811c9dc5)
    expect(stableHash('a')).toBe(0xe40c292c)
  })
})

describe('inPart', () => {
  const count = 7
  const parts = Array.from({ length: count }, (_, index) => ({ index, count }))

  it('puts every string and numeric key in exactly one part', () => {
    const keys: (string | number)[] = [...Array.from({ length: 500 }, (_, i) => `sku-${i}`), ...Array.from({ length: 500 }, (_, i) => 1_000_000 + i)]
    for (const key of keys) expect(parts.filter((part) => inPart(key, part))).toHaveLength(1)
  })

  it('spreads keys roughly evenly over the parts', () => {
    const sizes = parts.map((part) => Array.from({ length: 7000 }, (_, i) => `sku-${i}`).filter((key) => inPart(key, part)).length)
    for (const size of sizes) expect(size).toBeGreaterThan(800) // 1,000 each if perfectly even
  })

  it('treats no part, or a single part, as the whole catalog', () => {
    expect(inPart('anything', undefined)).toBe(true)
    expect(inPart(42, { index: 0, count: 1 })).toBe(true)
  })

  it('splits numeric ids by their remainder', () => {
    expect(inPart(15, { index: 1, count: 7 })).toBe(true)
    expect(inPart(15, { index: 0, count: 7 })).toBe(false)
  })
})

describe('partLabel', () => {
  it('is 1-based', () => {
    expect(partLabel({ index: 2, count: 7 })).toBe('3/7')
  })
})
