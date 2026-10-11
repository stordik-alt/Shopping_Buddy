import { describe, expect, it } from 'vitest'
import { resolveRumFlag, sanitizeRumEvent } from '@/lib/rum'

describe('resolveRumFlag', () => {
  it('turns on and is remembered with ?perf=1', () => {
    expect(resolveRumFlag('?perf=1', null)).toEqual({ enabled: true, remember: '1' })
  })

  it('turns off and is remembered with ?perf=0, even if it was on', () => {
    expect(resolveRumFlag('?perf=0', '1')).toEqual({ enabled: false, remember: '0' })
  })

  it('follows what the device remembered when the address says nothing', () => {
    expect(resolveRumFlag('?tab=nakup', '1')).toEqual({ enabled: true, remember: null })
    expect(resolveRumFlag('', null)).toEqual({ enabled: false, remember: null })
    expect(resolveRumFlag('', '0')).toEqual({ enabled: false, remember: null })
  })
})

describe('sanitizeRumEvent', () => {
  it('keeps numbers, booleans and short strings of a known event', () => {
    expect(sanitizeRumEvent({ type: 'tab', tab: 'Zásoby', ms: 412.6, first: true })).toEqual({ type: 'tab', tab: 'Zásoby', ms: 413, first: true })
  })

  it('accepts the start event that proves a device opted in', () => {
    expect(sanitizeRumEvent({ type: 'start', path: '/auth/sign-in' })).toEqual({ type: 'start', path: '/auth/sign-in' })
  })

  it('rejects an unknown type, a non-object and an oversized event', () => {
    expect(sanitizeRumEvent({ type: 'other', ms: 1 })).toBeNull()
    expect(sanitizeRumEvent('load')).toBeNull()
    expect(sanitizeRumEvent(null)).toBeNull()
    expect(sanitizeRumEvent([1, 2])).toBeNull()
    expect(sanitizeRumEvent(Object.fromEntries([['type', 'load'], ...Array.from({ length: 30 }, (_, i) => [`f${i}`, i])]))).toBeNull()
  })

  it('drops nested values, odd keys and non-finite numbers, and bounds the rest', () => {
    const event = sanitizeRumEvent({ type: 'load', ttfbMs: 120, nested: { a: 1 }, 'bad key': 1, nan: Number.NaN, huge: 1e12, text: 'x'.repeat(200) })
    expect(event).toEqual({ type: 'load', ttfbMs: 120, huge: 600000, text: 'x'.repeat(80) })
  })
})
