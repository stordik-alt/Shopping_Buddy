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
    expect(planStoreSync([branch('node/1')], [], 'osm')).toEqual({ insert: [branch('node/1')], update: [], adopt: [], unchanged: [] })
  })

  it('only marks an already imported, unchanged branch as seen', () => {
    const plan = planStoreSync([branch('node/1')], [row('a', { source: 'osm', externalId: 'node/1' })], 'osm')
    expect(plan).toEqual({ insert: [], update: [], adopt: [], unchanged: ['a'] })
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

  it('gives an existing branch to its nearest map point only, once', () => {
    const near = branch('node/near', { lat: 50.0002 })
    const far = branch('node/far', { lat: 50.0012, address: 'Jiná 2' })
    const plan = planStoreSync([far, near], [row('seed', { address: 'Nesouhlasí 9' })], 'osm')
    expect(plan.adopt).toEqual([{ id: 'seed', branch: near }])
    expect(plan.insert).toEqual([far])
  })

  it('never adopts a branch another source already owns', () => {
    const plan = planStoreSync([branch('node/1')], [row('other', { source: 'somewhere-else', externalId: 'x' })], 'osm')
    expect(plan.adopt).toEqual([])
    expect(plan.insert).toHaveLength(1)
  })
})
