import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// The orchestrator is tested against a stubbed data-access layer: what matters here is which
// persistence calls it makes for each kind of normalized product and how it isolates failures,
// not the SQL (covered by the DB-backed lib/db/queries.test.ts).
const queries = vi.hoisted(() => ({
  findProductIdByExternalRef: vi.fn(),
  getCanonicalStoreLocationId: vi.fn(),
  getStoreIdByChain: vi.fn(),
  recordPriceObservation: vi.fn(),
  resolveOrCreateProductFromExternal: vi.fn(),
  upsertActiveDeal: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => queries)

import { ingestPrices } from '@/lib/ingestion/ingest'

type Raw = { id: string; product: NormalizedProduct | null; throws?: boolean }

const base: Omit<NormalizedProduct, 'externalId' | 'name'> = {
  category: 'Potraviny',
  unit: 'kg',
  unitPrice: 100,
  regularPrice: 50,
  currency: 'CZK',
  recordedAt: '2026-09-24',
}
const product = (externalId: string, extra: Partial<NormalizedProduct> = {}): NormalizedProduct => ({ ...base, externalId, name: `P ${externalId}`, ...extra })

function connector(raws: Raw[]): PriceConnector<Raw> {
  return {
    source: 'billa',
    chain: 'Billa',
    fetchProducts: vi.fn(async () => raws),
    rawId: (raw) => raw.id,
    normalize: (raw) => {
      if (raw.throws) throw new Error('boom')
      return raw.product
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  queries.getStoreIdByChain.mockResolvedValue('store-1')
  queries.getCanonicalStoreLocationId.mockResolvedValue('loc-1')
  queries.findProductIdByExternalRef.mockResolvedValue(null)
  queries.resolveOrCreateProductFromExternal.mockResolvedValue('product-1')
})

describe('ingestPrices', () => {
  it('records an official chain-scope observation per usable product', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result).toMatchObject({ processed: 1, recorded: 1, newProducts: 1, deals: 0, skipped: 0, errors: [] })
    expect(queries.getStoreIdByChain).toHaveBeenCalledWith('Billa')
    expect(queries.resolveOrCreateProductFromExternal).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'a', source: 'billa' }))
    expect(queries.recordPriceObservation).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'store-1', storeLocationId: null, priceScope: 'CHAIN', sourceType: 'OFFICIAL', sourceReference: 'a', regularPrice: 50 }),
    )
  })

  it('does not count a product already linked to the source as new', async () => {
    queries.findProductIdByExternalRef.mockResolvedValue('existing')
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result.newProducts).toBe(0)
  })

  it('skips unusable records without persisting anything', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: null }]), 10)
    expect(result).toMatchObject({ processed: 1, recorded: 0, skipped: 1 })
    expect(queries.recordPriceObservation).not.toHaveBeenCalled()
  })

  it('stores a dated deal against the canonical store location, looked up once', async () => {
    const deal = { dealPrice: 40, validFrom: '2026-09-22', validUntil: '2026-09-28' }
    const result = await ingestPrices(
      connector([
        { id: 'a', product: product('a', { deal }) },
        { id: 'b', product: product('b', { deal }) },
      ]),
      10,
    )
    expect(result.deals).toBe(2)
    expect(queries.getCanonicalStoreLocationId).toHaveBeenCalledTimes(1)
    expect(queries.upsertActiveDeal).toHaveBeenCalledWith(expect.objectContaining({ storeLocationId: 'loc-1', dealPrice: 40, validUntil: '2026-09-28' }))
  })

  it('counts a promotion without a validity window but stores no deal for it', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: product('a', { promotionWithoutValidity: true }) }]), 10)
    expect(result).toMatchObject({ recorded: 1, deals: 0, promotionsWithoutValidity: 1 })
    expect(queries.upsertActiveDeal).not.toHaveBeenCalled()
    expect(queries.getCanonicalStoreLocationId).not.toHaveBeenCalled()
  })

  it("isolates one product's failure from the rest of the batch", async () => {
    const result = await ingestPrices(
      connector([
        { id: 'bad', product: null, throws: true },
        { id: 'good', product: product('good') },
      ]),
      10,
    )
    expect(result.recorded).toBe(1)
    expect(result.errors).toEqual(['bad: boom'])
  })

  it('reports a database failure for one product as an error and keeps going', async () => {
    queries.recordPriceObservation.mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined)
    const result = await ingestPrices(
      connector([
        { id: 'a', product: product('a') },
        { id: 'b', product: product('b') },
      ]),
      10,
    )
    expect(result.recorded).toBe(1)
    expect(result.errors).toEqual(['a: db down'])
  })

  it('does nothing for a non-positive limit', async () => {
    const c = connector([{ id: 'a', product: product('a') }])
    const result = await ingestPrices(c, 0)
    expect(result.processed).toBe(0)
    expect(c.fetchProducts).not.toHaveBeenCalled()
  })

  it('lets a fetch failure propagate so the caller can isolate that source', async () => {
    const c = connector([])
    ;(c.fetchProducts as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('source down'))
    await expect(ingestPrices(c, 10)).rejects.toThrow('source down')
  })
})
