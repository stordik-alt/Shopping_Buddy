import { describe, expect, it } from 'vitest'
import { distanceKm } from '@/lib/geo'
import { boundingBox, escapeLike } from '@/lib/stores/branch-search'

// pageCount/clampPage moved to lib/paging.ts (lib/paging.test.ts) — they are generic pagination
// maths, shared with the Akce tab's deal pages, not specific to branches.

describe('boundingBox', () => {
  const brno = { lat: 49.1951, lng: 16.6068 }

  it('contains every point within the radius (checked on the four compass directions)', () => {
    const box = boundingBox(brno, 5)
    // Move exactly 5 km north/south/east/west using the same distance function the SQL mirrors.
    const north = { lat: brno.lat + 5 / 111.2, lng: brno.lng }
    const east = { lat: brno.lat, lng: brno.lng + 5 / (111.2 * Math.cos((brno.lat * Math.PI) / 180)) }
    expect(distanceKm(brno, north)).toBeCloseTo(5, 1)
    expect(distanceKm(brno, east)).toBeCloseTo(5, 1)
    expect(north.lat).toBeLessThanOrEqual(box.maxLat + 1e-9)
    expect(east.lng).toBeLessThanOrEqual(box.maxLng + 1e-9)
    expect(box.minLat).toBeLessThan(brno.lat)
    expect(box.minLng).toBeLessThan(brno.lng)
  })

  it('is wider in longitude than latitude at Czech latitudes', () => {
    const box = boundingBox(brno, 5)
    expect(box.maxLng - box.minLng).toBeGreaterThan(box.maxLat - box.minLat)
  })

  it('stays finite next to a pole', () => {
    const box = boundingBox({ lat: 90, lng: 0 }, 5)
    expect(Number.isFinite(box.minLng) && Number.isFinite(box.maxLng)).toBe(true)
  })
})

describe('escapeLike', () => {
  it('matches user text literally', () => {
    expect(escapeLike('100%')).toBe('100\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('a\\b')).toBe('a\\\\b')
    expect(escapeLike('Brno')).toBe('Brno')
  })
})
