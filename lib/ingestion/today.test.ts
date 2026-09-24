import { describe, expect, it } from 'vitest'
import { ingestionDate } from '@/lib/ingestion/today'

describe('ingestionDate', () => {
  it('formats the date as ISO YYYY-MM-DD', () => {
    expect(ingestionDate(new Date('2026-09-24T12:00:00Z'))).toBe('2026-09-24')
  })

  it('uses the Czech calendar day, not the UTC one', () => {
    // 22:30 UTC on 24 Sep is 00:30 on 25 Sep in Prague (CEST, UTC+2).
    expect(ingestionDate(new Date('2026-09-24T22:30:00Z'))).toBe('2026-09-25')
    // 21:30 UTC is still 23:30 on the 24th.
    expect(ingestionDate(new Date('2026-09-24T21:30:00Z'))).toBe('2026-09-24')
  })

  it('handles winter time (UTC+1)', () => {
    expect(ingestionDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })

  it('the 05:00 Czech cron time falls on the same day in both summer and winter', () => {
    expect(ingestionDate(new Date('2026-07-15T03:00:00Z'))).toBe('2026-07-15') // 05:00 CEST
    expect(ingestionDate(new Date('2026-01-15T04:00:00Z'))).toBe('2026-01-15') // 05:00 CET
  })

  it('defaults to the current date', () => {
    expect(ingestionDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
