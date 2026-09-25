import { describe, expect, it, vi } from 'vitest'
import { buildAddressQuery, buildShopQuery, fetchOsmStoreElements, hasOwnAddress, runQuery } from '@/lib/stores/overpass'

describe('overpass queries', () => {
  it('asks for every chain the app knows, case-insensitively, within Czechia', () => {
    const query = buildShopQuery()
    expect(query).toContain('"brand"~"^(albert|billa|dm|globus|jip|kaufland|lidl|penny|tesco)$",i')
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

describe('fetching from busy servers', () => {
  const ok = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200 })
  const busy = () => new Response('<html>rate_limited</html>', { status: 429 })
  const noSleep = async () => {}

  it('moves on to the next instance when one is busy', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => (String(url).includes('overpass-api.de') ? busy() : ok([{ type: 'node', id: 1 }])))
    expect(await runQuery('q', { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep })).toEqual([{ type: 'node', id: 1 }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('tries every instance again after a pause when all were busy', async () => {
    let calls = 0
    const sleep = vi.fn(noSleep)
    const fetchImpl = vi.fn(async () => (++calls <= 4 ? busy() : ok([])))
    expect(await runQuery('q', { fetchImpl: fetchImpl as unknown as typeof fetch, sleep })).toEqual([])
    expect(sleep).toHaveBeenCalledWith(30_000)
  })

  it('gives up after three rounds, naming the servers', async () => {
    const fetchImpl = vi.fn(async () => busy())
    await expect(runQuery('q', { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep })).rejects.toThrow(/every server.*server busy/)
    expect(fetchImpl).toHaveBeenCalledTimes(12)
  })

  it('starts no attempt after the deadline', async () => {
    const fetchImpl = vi.fn(async () => busy())
    await expect(runQuery('q', { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, deadline: 1000, now: () => 2000 })).rejects.toThrow(/out of time/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('imports the chains that answered and reports the one that did not', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const query = decodeURIComponent(String(init?.body)).replace(/\+/g, ' ')
      if (query.includes('^(lidl)$')) return busy()
      if (query.includes('^(billa)$')) return ok([{ type: 'node', id: 7, tags: { brand: 'Billa', shop: 'supermarket', 'addr:street': 'A', 'addr:housenumber': '1', 'addr:city': 'B' } }])
      return ok([])
    })
    const result = await fetchOsmStoreElements({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep })
    expect(result.failedChains).toEqual(['Lidl'])
    expect(result.elements.map((element) => element.id)).toEqual([7])
    expect(result.failedAddressBatches).toBe(0)
  })

  it('fails as a whole only when no chain answered', async () => {
    const fetchImpl = vi.fn(async () => busy())
    await expect(fetchOsmStoreElements({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep })).rejects.toThrow('failed for every chain')
  })
})
