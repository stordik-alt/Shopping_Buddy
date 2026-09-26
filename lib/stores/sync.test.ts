import { describe, expect, it } from 'vitest'
import type { OsmBranch } from '@/lib/stores/osm'
import { planStoreSync, type ExistingLocation } from '@/lib/stores/sync'

const branch = (externalId: string, extra: Partial<OsmBranch> = {}): OsmBranch => ({
  externalId,
  chain: 'Lidl',
  name: 'Lidl Hlavní',
  address: 'Hlavní 1, 100 00 Praha',
  city: 'Praha',
  lat: 50.0,
  lng: 14.0,
  openingHours: 'Mo-Su 07:00-21:00',
  ...extra,
})
const row = (id: string, extra: Partial<ExistingLocation> = {}): ExistingLocation => ({
  id,
  chain: 'Lidl',
  name: 'Lidl Hlavní',
  address: 'Hlavní 1, 100 00 Praha',
  city: 'Praha',
  lat: 50.0,
  lng: 14.0,
  openingHours: 'Mo-Su 07:00-21:00',
  source: null,
  externalId: null,
  ...extra,
})

describe('planStoreSync', () => {
  it('inserts a branch nothing matches', () => {
    expect(planStoreSync([branch('node/1')], [], 'osm')).toEqual({ insert: [branch('node/1')], update: [], adopt: [], unchanged: [], skipped: [] })
  })

  it('only marks an already imported, unchanged branch as seen', () => {
    const plan = planStoreSync([branch('node/1')], [row('a', { source: 'osm', externalId: 'node/1' })], 'osm')
    expect(plan).toEqual({ insert: [], update: [], adopt: [], unchanged: ['a'], skipped: [] })
  })

  it('updates an imported branch whose data changed at the source', () => {
    const plan = planStoreSync([branch('node/1', { openingHours: 'Mo-Su 06:00-22:00' })], [row('a', { source: 'osm', externalId: 'node/1' })], 'osm')
    expect(plan.update).toEqual([{ id: 'a', branch: branch('node/1', { openingHours: 'Mo-Su 06:00-22:00' }) }])
  })

  it('adopts a seeded or receipt branch of the same chain nearby, keeping its id', () => {
    // ~55 m apart, within the adoption radius.
    const plan = planStoreSync([branch('node/1', { lat: 50.0005 })], [row('seed', { address: 'Jinak zapsaná 1' })], 'osm')
    expect(plan.adopt).toEqual([{ id: 'seed', branch: branch('node/1', { lat: 50.0005 }) }])
    expect(plan.insert).toEqual([])
  })

  it('adopts a receipt branch without GPS by its address', () => {
    const plan = planStoreSync([branch('node/1')], [row('receipt', { lat: null, lng: null, address: '  hlavní 1,  100 00 praha ' })], 'osm')
    expect(plan.adopt.map((entry) => entry.id)).toEqual(['receipt'])
  })

  it('does not adopt a branch of another chain or one too far away', () => {
    const plan = planStoreSync([branch('node/1')], [row('penny', { chain: 'Penny' }), row('far', { lat: 50.01, address: 'Jinde 5' })], 'osm')
    expect(plan.adopt).toEqual([])
    expect(plan.insert).toHaveLength(1)
  })

  it('adopts a branch moved to another chain of the same retailer (an Albert hypermarket)', () => {
    const albert = branch('node/1', { chain: 'Albert', name: 'Albert Hlavní' })
    const plan = planStoreSync([albert], [row('hyper', { chain: 'Albert Hypermarket', address: 'Jinak zapsaná 1' })], 'osm')
    expect(plan.adopt).toEqual([{ id: 'hyper', branch: albert }])
    expect(plan.insert).toEqual([])
  })

  it('gives an existing branch to its nearest map point only, once', () => {
    const near = branch('node/near', { lat: 50.0002 })
    const far = branch('node/far', { lat: 50.0012, address: 'Jiná 2' })
    const plan = planStoreSync([far, near], [row('seed', { address: 'Nesouhlasí 9' })], 'osm')
    expect(plan.adopt).toEqual([{ id: 'seed', branch: near }])
    expect(plan.insert).toEqual([far])
  })

  it('never adopts a branch another source already owns', () => {
    const plan = planStoreSync([branch('node/1', { address: 'Jiná 2' })], [row('other', { source: 'somewhere-else', externalId: 'x' })], 'osm')
    expect(plan.adopt).toEqual([])
    expect(plan.insert).toHaveLength(1)
  })

  // One branch per chain and address: store_locations_store_address_city_unique_idx. Breaking it
  // failed the whole insert of `pnpm db:import-stores --apply` (2026-09-26).
  describe('one branch per chain and address', () => {
    it('inserts a shop the map lists twice (point and building) only once', () => {
      const point = branch('node/14211627833')
      const building = branch('way/142288943', { lat: 50.0001 })
      const plan = planStoreSync([point, building], [], 'osm')
      expect(plan.insert).toEqual([point])
      expect(plan.skipped).toEqual([building])
    })

    it('compares addresses like the database: trimmed, whitespace collapsed, any case', () => {
      const plan = planStoreSync([branch('node/1'), branch('node/2', { address: ' hlavní  1, 100 00 PRAHA', city: 'praha ', lat: 50.01 })], [], 'osm')
      expect(plan.insert.map((entry) => entry.externalId)).toEqual(['node/1'])
      expect(plan.skipped.map((entry) => entry.externalId)).toEqual(['node/2'])
    })

    it('allows the same address for different chains', () => {
      const plan = planStoreSync([branch('node/1'), branch('node/2', { chain: 'Penny', name: 'Penny Hlavní' })], [], 'osm')
      expect(plan.insert).toHaveLength(2)
    })

    it('re-points an earlier import whose id the map has replaced, instead of inserting a copy', () => {
      const way = branch('way/9', { lat: 50.01 })
      const plan = planStoreSync([way], [row('old', { source: 'osm', externalId: 'node/1' })], 'osm')
      expect(plan.adopt).toEqual([{ id: 'old', branch: way }])
      expect(plan.insert).toEqual([])
    })

    it('does not take over an earlier import the map still lists', () => {
      const copy = branch('way/9', { lat: 50.01 })
      const plan = planStoreSync([branch('node/1'), copy], [row('old', { source: 'osm', externalId: 'node/1' })], 'osm')
      expect(plan.unchanged).toEqual(['old'])
      expect(plan.adopt).toEqual([])
      expect(plan.skipped).toEqual([copy])
    })

    it('skips a branch at the address of a branch another source owns', () => {
      const plan = planStoreSync([branch('node/1')], [row('other', { source: 'somewhere-else', externalId: 'x', lat: 51 })], 'osm')
      expect(plan.insert).toEqual([])
      expect(plan.skipped).toEqual([branch('node/1')])
    })

    it("does not move an imported branch onto another branch's address", () => {
      const moved = branch('node/1', { address: 'Druhá 2, 100 00 Praha' })
      const plan = planStoreSync([moved], [row('a', { source: 'osm', externalId: 'node/1' }), row('b', { address: 'Druhá 2, 100 00 Praha', lat: 51 })], 'osm')
      expect(plan.update).toEqual([])
      expect(plan.unchanged).toEqual(['a'])
      expect(plan.skipped).toEqual([moved])
    })

    it('lets a new branch take an address an update has just vacated', () => {
      const moved = branch('node/1', { address: 'Nová 3, 100 00 Praha' })
      const newcomer = branch('node/2', { lat: 50.01 })
      const plan = planStoreSync([newcomer, moved], [row('a', { source: 'osm', externalId: 'node/1' })], 'osm')
      expect(plan.update).toEqual([{ id: 'a', branch: moved }])
      expect(plan.insert).toEqual([newcomer])
    })
  })
})
