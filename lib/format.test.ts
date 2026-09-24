import { describe, expect, it } from 'vitest'
import { longDate, shortDate } from '@/lib/format'

describe('longDate', () => {
  it('formats an ISO date in Czech with the correct weekday', () => {
    // 19 September 2026 is a Saturday — the previous hard-coded header wrongly said "Pátek".
    expect(longDate('2026-09-19')).toBe('sobota 19. září 2026')
  })

  it('does not roll onto a neighbouring day', () => {
    expect(longDate('2026-01-01')).toContain('1. ledna 2026')
    expect(longDate('2026-12-31')).toContain('31. prosince 2026')
  })
})

describe('shortDate', () => {
  it('formats an ISO date as day. month. without leading zeros', () => {
    expect(shortDate('2026-09-24')).toBe('24. 9.')
    expect(shortDate('2026-01-05')).toBe('5. 1.')
    expect(shortDate('2026-12-31')).toBe('31. 12.')
  })

  it('ignores a time part and never shifts the day', () => {
    expect(shortDate('2026-09-24T23:59:59Z')).toBe('24. 9.')
  })

  it('returns the input unchanged when it is not an ISO date', () => {
    expect(shortDate('včera')).toBe('včera')
  })
})
