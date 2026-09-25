import { describe, expect, it } from 'vitest'
import { branchName, formatAddress, formatOpeningHours, formatPostcode, parseOsmBranches, type OverpassElement } from '@/lib/stores/osm'

const shop = (id: number, tags: Record<string, string>, lat = 50.0173, lon = 14.4521): OverpassElement => ({ type: 'node', id, lat, lon, tags: { shop: 'supermarket', ...tags } })
const address = (id: number, tags: Record<string, string>, lat: number, lon: number): OverpassElement => ({ type: 'way', id, center: { lat, lon }, tags })

describe('parseOsmBranches', () => {
  it('takes a shop with its own full address as it is', () => {
    const { branches, rejected } = parseOsmBranches([
      shop(1, { brand: 'Albert', name: 'Albert', 'addr:street': 'Zdislavická', 'addr:housenumber': '583', 'addr:postcode': '14200', 'addr:city': 'Praha 4', opening_hours: 'Mo-Su 07:00-22:00' }),
    ])
    expect(rejected).toEqual([])
    expect(branches).toEqual([
      { externalId: 'node/1', chain: 'Albert', name: 'Albert Zdislavická', address: 'Zdislavická 583, 142 00 Praha 4', city: 'Praha 4', lat: 50.0173, lng: 14.4521, openingHours: 'Mo-Su 07:00-22:00' },
    ])
  })

  it('fills a bare shop point from the nearest address point, not a farther one', () => {
    const { branches } = parseOsmBranches([
      shop(2, { brand: 'Lidl' }, 50.0, 14.0),
      address(10, { 'addr:street': 'Daleká', 'addr:housenumber': '9', 'addr:city': 'Praha' }, 50.0004, 14.0), // ~45 m
      address(11, { 'addr:street': 'Blízká', 'addr:housenumber': '1234/5', 'addr:postcode': '10000', 'addr:city': 'Praha' }, 50.0001, 14.0), // ~11 m
    ])
    expect(branches[0]).toMatchObject({ name: 'Lidl Blízká', address: 'Blízká 1234/5, 100 00 Praha', city: 'Praha' })
  })

  it('rejects a shop with no address within reach instead of inventing one', () => {
    const { branches, rejected } = parseOsmBranches([
      shop(3, { brand: 'Penny' }, 50.0, 14.0),
      address(12, { 'addr:street': 'Jinde', 'addr:housenumber': '1', 'addr:city': 'Praha' }, 50.002, 14.0), // ~220 m
    ])
    expect(branches).toEqual([])
    expect(rejected).toEqual([{ externalId: 'node/3', chain: 'Penny', reason: 'no-address' }])
  })

  it('takes a house number from a neighbouring point only on the same street', () => {
    const elements = [shop(4, { brand: 'Billa', 'addr:street': 'Hlavní', 'addr:city': 'Brno' }, 49.2, 16.6), address(13, { 'addr:street': 'Vedlejší', 'addr:housenumber': '7', 'addr:city': 'Brno' }, 49.2001, 16.6)]
    expect(parseOsmBranches(elements).rejected).toHaveLength(1)
    elements[1].tags!['addr:street'] = 'Hlavní'
    expect(parseOsmBranches(elements).branches[0].address).toBe('Hlavní 7, Brno')
  })

  it('maps brands case-insensitively and ignores other brands and closed shops', () => {
    const base = { 'addr:street': 'Ulice', 'addr:housenumber': '1', 'addr:city': 'Plzeň' }
    const { branches } = parseOsmBranches([
      shop(5, { brand: 'PENNY', name: 'PENNY', ...base }),
      shop(6, { brand: 'Globus', ...base }),
      shop(7, { brand: 'Lidl', ...base, shop: 'vacant' }),
      shop(8, { brand: 'dm', ...base, shop: 'chemist' }),
    ])
    expect(branches.map((branch) => [branch.chain, branch.name])).toEqual([
      ['Penny', 'Penny Ulice'],
      ['dm', 'dm Ulice'],
    ])
  })

  it('rejects a point outside Czechia and lists each map object once', () => {
    const base = { brand: 'Kaufland', 'addr:street': 'Str', 'addr:housenumber': '1', 'addr:city': 'Wien' }
    const { branches, rejected } = parseOsmBranches([shop(9, base, 48.2, 16.37), shop(9, base, 48.2, 16.37)])
    expect(branches).toEqual([])
    expect(rejected).toEqual([{ externalId: 'node/9', chain: 'Kaufland', reason: 'outside-cz' }])
  })

  it('uses the village name for a house numbered per place', () => {
    const { branches } = parseOsmBranches([shop(14, { brand: 'Penny', 'addr:place': 'Lhota', 'addr:conscriptionnumber': '112', 'addr:city': 'Lhota' })])
    expect(branches[0]).toMatchObject({ name: 'Penny Lhota', address: 'Lhota 112, Lhota' })
  })
})

describe('branchName', () => {
  it('keeps a more specific name of the chain, and does not repeat the street', () => {
    expect(branchName('Tesco', 'Tesco Express', 'Vinohradská', 'Praha')).toBe('Tesco Express Vinohradská')
    expect(branchName('Albert', 'Albert Anděl', 'Anděl', 'Praha')).toBe('Albert Anděl')
    expect(branchName('Lidl', 'Něco jiného', 'Nádražní', 'Kolín')).toBe('Lidl Nádražní')
  })
})

describe('formatPostcode / formatAddress', () => {
  it('writes postcodes the Czech way', () => {
    expect(formatPostcode('14000')).toBe('140 00')
    expect(formatPostcode('140 00')).toBe('140 00')
  })

  it('leaves out a missing postcode', () => {
    expect(formatAddress({ street: 'Hlavní', number: '1', postcode: null, city: 'Brno' })).toBe('Hlavní 1, Brno')
  })
})

describe('formatOpeningHours', () => {
  it('translates day ranges and drops leading zeros', () => {
    expect(formatOpeningHours('Mo-Sa 07:00-21:00; Su 08:00-20:00')).toBe('Po–So 7:00–21:00 · Ne 8:00–20:00')
    expect(formatOpeningHours('Mo-Sa 07:00-21:00, Su 08:00-21:00')).toBe('Po–So 7:00–21:00 · Ne 8:00–21:00')
    expect(formatOpeningHours('Mo-Fr 08:00-20:00; Sa,Su 08:00-19:00')).toBe('Po–Pá 8:00–20:00 · So, Ne 8:00–19:00')
  })

  it('handles holidays, every-day times, split times and non-stop', () => {
    expect(formatOpeningHours('Mo-Su 07:00-21:00; PH off')).toBe('Po–Ne 7:00–21:00 · svátky zavřeno')
    expect(formatOpeningHours('7:00-22:00')).toBe('7:00–22:00')
    expect(formatOpeningHours('Mo-Fr 08:00-12:00,13:00-17:00')).toBe('Po–Pá 8:00–12:00, 13:00–17:00')
    expect(formatOpeningHours('24/7')).toBe('nonstop')
  })

  it('leaves anything it does not understand unchanged rather than half-translated', () => {
    expect(formatOpeningHours('Jan-Mar Mo-Fr 08:00-16:00')).toBe('Jan-Mar Mo-Fr 08:00-16:00')
    expect(formatOpeningHours('Mo-Fr 08:00-20:00 "dle sezóny"')).toBe('Mo-Fr 08:00-20:00 "dle sezóny"')
  })
})
