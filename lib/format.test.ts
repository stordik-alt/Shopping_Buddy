import { describe, expect, it } from 'vitest'
import { longDate } from '@/lib/format'

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
