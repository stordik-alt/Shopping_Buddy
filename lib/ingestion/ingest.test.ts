import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestResult, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// The orchestrator is tested against a stubbed data-access layer: what matters here is which
// persistence calls it makes for each kind of normalized product, how it isolates failures and how
// it keeps to its time budget — not the SQL (covered by the DB-backed lib/db/queries.test.ts).
const queries = vi.hoisted(() => ({
  getCanonicalStoreLocationId: vi.fn(),
  getStoreIdByChain: vi.fn(),
  loadExternalProductContext: vi.fn(),
  recordPriceObservation: vi.fn(),
  resolveOrCreateProductFromExternal: vi.fn(),
  touchExternalRefs: vi.fn(),
  upsertActiveDeal: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => queries)

import { ingestPrices, runPriceSources } from '@/lib/ingestion/ingest'

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

const emptyContext = () => ({ refs: new Map<string, string>(), catalog: [], categoryIds: new Map<string, string>() })

beforeEach(() => {
  vi.clearAllMocks()
  queries.getStoreIdByChain.mockResolvedValue('store-1')
  queries.getCanonicalStoreLocationId.mockResolvedValue('loc-1')
  queries.loadExternalProductContext.mockResolvedValue(emptyContext())
  queries.touchExternalRefs.mockResolvedValue(undefined)
  queries.resolveOrCreateProductFromExternal.mockResolvedValue('product-1')
})

describe('ingestPrices', () => {
  it('records an official chain-scope observation per usable product', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result).toMatchObject({ processed: 1, recorded: 1, newProducts: 1, deals: 0, skipped: 0, truncated: false, errors: [] })
    expect(queries.getStoreIdByChain).toHaveBeenCalledWith('Billa')
    expect(queries.resolveOrCreateProductFromExternal).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'a', source: 'billa' }), expect.anything())
    expect(queries.recordPriceObservation).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'store-1', storeLocationId: null, priceScope: 'CHAIN', sourceType: 'OFFICIAL', sourceReference: 'a', regularPrice: 50 }),
    )
  })

  it('stores a deal but records no price observation when the source states no regular price', async () => {
    const deal = { dealPrice: 15.9, validFrom: '2026-09-23', validUntil: '2026-09-29' }
    const result = await ingestPrices(connector([{ id: 'a', product: product('a', { regularPrice: null, unitPrice: null, deal }) }]), 10)
    expect(result).toMatchObject({ processed: 1, recorded: 0, deals: 1, skipped: 0 })
    expect(queries.recordPriceObservation).not.toHaveBeenCalled()
    expect(queries.upsertActiveDeal).toHaveBeenCalledWith(expect.objectContaining({ dealPrice: 15.9 }))
  })

  it('does not count a product already linked to the source as new', async () => {
    queries.loadExternalProductContext.mockResolvedValue({ ...emptyContext(), refs: new Map([['a', 'existing']]) })
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result.newProducts).toBe(0)
    // Already-linked products are marked as seen in one batch at the end, not one query each.
    expect(queries.touchExternalRefs).toHaveBeenCalledWith('billa', ['a'])
  })

  it('loads the lookup context once per run and shares it with every product', async () => {
    const context = emptyContext()
    queries.loadExternalProductContext.mockResolvedValue(context)
    await ingestPrices(
      connector([
        { id: 'a', product: product('a') },
        { id: 'b', product: product('b') },
        { id: 'c', product: product('c') },
      ]),
      10,
    )
    expect(queries.loadExternalProductContext).toHaveBeenCalledTimes(1)
    expect(queries.getStoreIdByChain).toHaveBeenCalledTimes(1)
    expect(queries.resolveOrCreateProductFromExternal).toHaveBeenCalledTimes(3)
    for (const call of queries.resolveOrCreateProductFromExternal.mock.calls) expect(call[1]).toBe(context)
  })

  it('reports a failed last-seen update as an error without failing the run', async () => {
    queries.loadExternalProductContext.mockResolvedValue({ ...emptyContext(), refs: new Map([['a', 'existing']]) })
    queries.touchExternalRefs.mockRejectedValue(new Error('db down'))
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result.recorded).toBe(1)
    expect(result.errors).toEqual(['last-seen update: db down'])
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

describe('ingestPrices time budget', () => {
  it('stops between products once the deadline has passed and reports the run as truncated', async () => {
    let clock = 0
    // The clock advances 100 ms every time it is read, so a deadline of 350 lets three products start.
    const now = () => (clock += 100)
    const raws = ['a', 'b', 'c', 'd'].map((id) => ({ id, product: product(id) }))
    const result = await ingestPrices(connector(raws), 10, { deadline: 350, now })
    expect(result.truncated).toBe(true)
    expect(result.recorded).toBe(3)
    expect(result.processed).toBe(4) // fetched, though not all were processed
    expect(queries.touchExternalRefs).toHaveBeenCalled() // closing bookkeeping still runs
  })

  it('does not start any product when the deadline has already passed', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10, { deadline: 0, now: () => 1 })
    expect(result).toMatchObject({ truncated: true, recorded: 0 })
    expect(queries.resolveOrCreateProductFromExternal).not.toHaveBeenCalled()
  })

  it('passes the deadline to the connector so its own fetching stops in time', async () => {
    const c = connector([{ id: 'a', product: product('a') }])
    await ingestPrices(c, 10, { deadline: 99_999 })
    expect(c.fetchProducts).toHaveBeenCalledWith(10, { deadline: 99_999 })
  })

  it('is not truncated when it finishes within the budget', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10, { deadline: 1e15 })
    expect(result.truncated).toBe(false)
  })
})

describe('runPriceSources', () => {
  const ok = (extra: Partial<IngestResult> = {}): IngestResult => ({
    processed: 1,
    recorded: 1,
    newProducts: 0,
    deals: 0,
    promotionsWithoutValidity: 0,
    skipped: 0,
    truncated: false,
    errors: [],
    ...extra,
  })
  type Run = (limit: number, options?: { deadline?: number }) => Promise<IngestResult>
  const entry = (source: string, run: Run) => ({ source, run })

  it('runs only the requested source', async () => {
    const a = vi.fn(async () => ok())
    const b = vi.fn(async () => ok())
    const results = await runPriceSources({ only: 'b', limit: 5, budgetMs: 1000, sources: [entry('a', a), entry('b', b)] })
    expect(Object.keys(results)).toEqual(['b'])
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith(5, expect.objectContaining({ deadline: expect.any(Number) }))
  })

  it('runs every source when none is requested, all sharing one deadline', async () => {
    const seen: (number | undefined)[] = []
    const run: Run = async (_limit, options) => {
      seen.push(options?.deadline)
      return ok()
    }
    const results = await runPriceSources({ limit: 5, budgetMs: 1000, now: () => 0, sources: [entry('a', run), entry('b', run)] })
    expect(Object.keys(results)).toEqual(['a', 'b'])
    expect(seen).toEqual([1000, 1000])
  })

  it('isolates a failing source from the others', async () => {
    const failing: Run = async () => {
      throw new Error('site changed')
    }
    const results = await runPriceSources({ limit: 5, budgetMs: 1000, sources: [entry('a', failing), entry('b', async () => ok())] })
    expect(results.a).toEqual({ error: 'site changed' })
    expect(results.b).toMatchObject({ recorded: 1 })
  })

  it('skips, rather than starts, a source once the budget is spent', async () => {
    let clock = 0
    const second = vi.fn(async () => ok())
    const first: Run = async () => {
      clock = 1500 // this source used up the whole budget
      return ok({ truncated: true })
    }
    const results = await runPriceSources({ limit: 5, budgetMs: 1000, now: () => clock, sources: [entry('a', first), entry('b', second)] })
    expect(results.a).toMatchObject({ truncated: true })
    expect(results.b).toEqual({ skipped: 'time budget exhausted before this source started' })
    expect(second).not.toHaveBeenCalled()
  })
})
