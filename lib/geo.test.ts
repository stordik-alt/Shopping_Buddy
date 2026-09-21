import { describe, expect, it } from 'vitest'
import { distanceKm, nearestLocation } from '@/lib/geo'

describe('distanceKm', () => {
  it('is 0 for identical coordinates', () => {
    expect(distanceKm({ lat: 50.0755, lng: 14.4378 }, { lat: 50.0755, lng: 14.4378 })).toBeCloseTo(0, 5)
  })

  it('matches the known great-circle distance between Prague and Brno (~185 km)', () => {
    const prague = { lat: 50.0755, lng: 14.4378 }
    const brno = { lat: 49.1951, lng: 16.6068 }
    expect(distanceKm(prague, brno)).toBeCloseTo(185, -1)
  })

  it('is symmetric', () => {
    const a = { lat: 50.0522, lng: 14.4491 }
    const b = { lat: 50.0361, lng: 14.4381 }
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10)
  })
})

describe('nearestLocation', () => {
  const user = { lat: 50.0755, lng: 14.4378 } // Prague center

  it('picks the closest of several locations', () => {
    const locations = [
      { id: 'far', gps: { lat: 49.1951, lng: 16.6068 } }, // Brno, ~185km away
      { id: 'near', gps: { lat: 50.0755, lng: 14.4378 } }, // same point, 0km away
    ]
    const result = nearestLocation(user, locations)
    expect(result?.location.id).toBe('near')
    expect(result?.distanceKm).toBeCloseTo(0, 5)
  })

  it('returns null for an empty list rather than throwing', () => {
    expect(nearestLocation(user, [])).toBeNull()
  })
})
