import { describe, expect, it } from 'vitest'
import { buildAddressQuery, buildShopQuery, hasOwnAddress } from '@/lib/stores/overpass'

describe('overpass queries', () => {
  it('asks for every chain the app knows, case-insensitively, within Czechia', () => {
    const query = buildShopQuery()
    expect(query).toContain('"brand"~"^(albert|billa|dm|jip|kaufland|lidl|penny|tesco)$",i')
    expect(query).toContain('area["ISO3166-1"="CZ"]')
  })

  it('looks for address points only around the given map objects, by type', () => {
    const query = buildAddressQuery([
      { type: 'node', id: 1 },
      { type: 'way', id: 2 },
      { type: 'node', id: 3 },
    ])
    expect(query).toContain('(node(id:1,3);way(id:2);)->.s;')
    expect(query).toContain('nwr(around.s:60)["addr:housenumber"];')
  })
})

describe('hasOwnAddress', () => {
  it('needs a street or place, a house number and a town', () => {
    expect(hasOwnAddress({ 'addr:street': 'Hlavní', 'addr:housenumber': '1', 'addr:city': 'Brno' })).toBe(true)
    expect(hasOwnAddress({ 'addr:place': 'Lhota', 'addr:conscriptionnumber': '12', 'addr:city': 'Lhota' })).toBe(true)
    expect(hasOwnAddress({ 'addr:street': 'Hlavní', 'addr:housenumber': '1' })).toBe(false)
    expect(hasOwnAddress(undefined)).toBe(false)
  })
})
