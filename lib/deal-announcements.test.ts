import { describe, expect, it } from 'vitest'
import { announcementKey, announcementText, flyersToAnnounce, shiftDate, type FlyerStart } from '@/lib/deal-announcements'
import { dealsChainHref } from '@/lib/tab-url'

const start = (overrides: Partial<FlyerStart> = {}): FlyerStart => ({ storeId: 'penny', chain: 'Penny', validFrom: '2026-10-08', deals: 266, ...overrides })
const TODAY = '2026-10-06' // a Tuesday

describe('flyersToAnnounce', () => {
  it('announces a flyer with enough deals from yesterday up to three days ahead, oldest first', () => {
    const due = flyersToAnnounce(
      [start({ storeId: 'b', chain: 'Billa', validFrom: '2026-10-09' }), start(), start({ storeId: 'l', chain: 'Lidl', validFrom: '2026-10-05' })],
      new Set(),
      TODAY,
    )
    expect(due.map((flyer) => flyer.chain)).toEqual(['Lidl', 'Penny', 'Billa'])
  })

  it('leaves out a handful of deals, an old or far-off start, and a flyer announced before', () => {
    expect(flyersToAnnounce([start({ deals: 29 })], new Set(), TODAY)).toEqual([])
    expect(flyersToAnnounce([start({ validFrom: '2026-10-04' })], new Set(), TODAY)).toEqual([])
    expect(flyersToAnnounce([start({ validFrom: '2026-10-10' })], new Set(), TODAY)).toEqual([])
    expect(flyersToAnnounce([start()], new Set([announcementKey(start())]), TODAY)).toEqual([])
  })
})

describe('announcementText', () => {
  it('names the chain, the start day and the number of deals', () => {
    expect(announcementText(start(), TODAY)).toEqual({ title: 'Nové akce v Penny', detail: 'Od čtvrtka 8. 10. — 266 nabídek.' })
    expect(announcementText(start({ validFrom: '2026-10-07', deals: 32 }), TODAY).detail).toBe('Od zítřka 7. 10. — 32 nabídek.')
    expect(announcementText(start({ validFrom: TODAY, deals: 3 }), TODAY).detail).toBe('Od dneška — 3 nabídky.')
    expect(announcementText(start({ validFrom: '2026-10-05' }), TODAY).detail).toBe('Od včera — 266 nabídek.')
  })

  it('moves dates across a month end', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('dealsChainHref', () => {
  it('opens Akce filtered to the chain', () => {
    expect(dealsChainHref('Albert Hypermarket')).toBe('/?tab=akce&retezec=Albert%20Hypermarket')
  })
})
