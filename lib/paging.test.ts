import { describe, expect, it } from 'vitest'
import { clampPage, pageCount } from '@/lib/paging'

describe('pageCount', () => {
  it('rounds up and never drops below one page', () => {
    expect(pageCount(0, 5)).toBe(1)
    expect(pageCount(5, 5)).toBe(1)
    expect(pageCount(6, 5)).toBe(2)
    expect(pageCount(20, 5)).toBe(4)
  })
})

describe('clampPage', () => {
  it('keeps a valid page and pulls an out-of-range one into 1..last', () => {
    expect(clampPage(2, 20, 5)).toBe(2)
    expect(clampPage(9, 20, 5)).toBe(4)
    expect(clampPage(0, 20, 5)).toBe(1)
    expect(clampPage(-3, 20, 5)).toBe(1)
    expect(clampPage(3, 0, 5)).toBe(1)
  })

  it('treats a non-finite page as the first', () => {
    expect(clampPage(Number.NaN, 20, 5)).toBe(1)
  })
})
