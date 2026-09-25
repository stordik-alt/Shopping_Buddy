import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IngestionSource, IngestResult, NormalizedProduct, PriceConnector } from '@/lib/ingestion/types'

// The orchestrator is tested against a stubbed data-access layer: what matters here is which
// persistence calls it makes for each kind of normalized product, how it isolates failures and how
// it keeps to its time budget — not the SQL (covered by the DB-backed lib/db/queries.test.ts).
const queries = vi.hoisted(() => ({
  getCanonicalStoreLocationId: vi.fn(),
  getStoreByChain: vi.fn(),
  loadExternalProductContext: vi.fn(),
  loadLatestOfficialPrices: vi.fn(),
  recordOfficialPrice: vi.fn(),
  resolveOrCreateProductFromExternal: vi.fn(),
  touchExternalRefs: vi.fn(),
  upsertActiveDeal: vi.fn(),
  getIngestionCursor: vi.fn(),
  setIngestionCursor: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => queries)

import { ingestPrices, PRICE_SOURCES, runPriceSources } from '@/lib/ingestion/ingest'

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
  queries.getStoreByChain.mockResolvedValue({ id: 'store-1', isOnline: false })
  queries.getCanonicalStoreLocationId.mockResolvedValue('loc-1')
  queries.loadExternalProductContext.mockResolvedValue(emptyContext())
  queries.touchExternalRefs.mockResolvedValue(undefined)
  queries.loadLatestOfficialPrices.mockResolvedValue(new Map())
  queries.recordOfficialPrice.mockResolvedValue({ action: 'insert', latest: undefined, closedPrevious: false })
  queries.resolveOrCreateProductFromExternal.mockResolvedValue('product-1')
  queries.getIngestionCursor.mockResolvedValue(0)
  queries.setIngestionCursor.mockResolvedValue(undefined)
})

describe('ingestPrices', () => {
  it('records an official chain-scope observation per usable product', async () => {
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result).toMatchObject({ processed: 1, recorded: 1, newProducts: 1, deals: 0, skipped: 0, truncated: false, errors: [] })
    expect(queries.getStoreByChain).toHaveBeenCalledWith('Billa')
    expect(queries.resolveOrCreateProductFromExternal).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'a', source: 'billa' }), expect.anything())
    expect(queries.recordOfficialPrice).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'product-1', storeId: 'store-1', sourceReference: 'a', regularPrice: 50, unit: 'kg', unitPrice: 100 }),
      undefined,
    )
  })

  it('stores a deal but records no price observation when the source states no regular price', async () => {
    const deal = { dealPrice: 15.9, unitPrice: 79.5, validFrom: '2026-09-23', validUntil: '2026-09-29' }
    const result = await ingestPrices(connector([{ id: 'a', product: product('a', { regularPrice: null, unitPrice: null, deal }) }]), 10)
    expect(result).toMatchObject({ processed: 1, recorded: 0, deals: 1, skipped: 0 })
    expect(queries.recordOfficialPrice).not.toHaveBeenCalled()
    expect(queries.upsertActiveDeal).toHaveBeenCalledWith(expect.objectContaining({ dealPrice: 15.9, unit: 'kg', unitPrice: 79.5 }))
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
    expect(queries.getStoreByChain).toHaveBeenCalledTimes(1)
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
    expect(queries.recordOfficialPrice).not.toHaveBeenCalled()
  })

  it('stores a dated deal against the canonical store location, looked up once', async () => {
    const deal = { dealPrice: 40, unitPrice: 80, validFrom: '2026-09-22', validUntil: '2026-09-28' }
    const result = await ingestPrices(
      connector([
        { id: 'a', product: product('a', { deal }) },
        { id: 'b', product: product('b', { deal }) },
      ]),
      10,
    )
    expect(result.deals).toBe(2)
    expect(queries.getCanonicalStoreLocationId).toHaveBeenCalledTimes(1)
    expect(queries.upsertActiveDeal).toHaveBeenCalledWith(expect.objectContaining({ storeId: 'store-1', storeLocationId: 'loc-1', dealPrice: 40, unit: 'kg', unitPrice: 80, validUntil: '2026-09-28' }))
  })

  it('stores an online-only chain\'s deal with the chain and no branch, without looking for one', async () => {
    queries.getStoreByChain.mockResolvedValue({ id: 'store-online', isOnline: true })
    const deal = { dealPrice: 40, unitPrice: 80, validFrom: '2026-09-22', validUntil: '2026-09-28' }
    const result = await ingestPrices(connector([{ id: 'a', product: product('a', { deal }) }]), 10)
    expect(result.deals).toBe(1)
    expect(queries.getCanonicalStoreLocationId).not.toHaveBeenCalled()
    expect(queries.upsertActiveDeal).toHaveBeenCalledWith(expect.objectContaining({ storeId: 'store-online', storeLocationId: null, dealPrice: 40 }))
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
    queries.recordOfficialPrice.mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ action: 'insert', latest: undefined, closedPrevious: false })
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

describe('ingestPrices price dating and history', () => {
  const snapshot = (observedAt: string, regularPrice = 50) => ({ id: 'row-1', observedAt, regularPrice, unit: 'kg' as const, unitPrice: 100, currency: 'CZK', validUntil: null })

  it("stamps prices with the run's real date, not the app's fixed demo date", async () => {
    let seenDate: string | undefined
    const c = connector([{ id: 'a', product: product('a') }])
    c.normalize = (_raw, today) => {
      seenDate = today
      return product('a')
    }
    await ingestPrices(c, 10, { today: '2026-10-05' })
    expect(seenDate).toBe('2026-10-05')
  })

  it("defaults to today's real date in Czech time", async () => {
    let seenDate = ''
    const c = connector([{ id: 'a', product: product('a') }])
    c.normalize = (_raw, today) => {
      seenDate = today
      return product('a')
    }
    await ingestPrices(c, 10)
    expect(seenDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(seenDate).not.toBe('2026-09-19') // the fixed demo date of lib/budget.ts's TODAY
  })

  it("hands each SKU's latest stored observation to the writer and keeps the map current", async () => {
    const stored = snapshot('2026-09-20')
    queries.loadLatestOfficialPrices.mockResolvedValue(new Map([['a', stored]]))
    const written = snapshot('2026-09-24', 60)
    queries.recordOfficialPrice.mockResolvedValue({ action: 'insert', latest: written, closedPrevious: true })
    await ingestPrices(
      connector([
        { id: 'a', product: product('a', { regularPrice: 60 }) },
        { id: 'b', product: product('b') },
      ]),
      10,
    )
    expect(queries.recordOfficialPrice.mock.calls[0][1]).toBe(stored) // SKU a: its own latest
    expect(queries.recordOfficialPrice.mock.calls[1][1]).toBeUndefined() // SKU b: nothing stored yet
  })

  it('counts a price change (old price kept and closed) separately from a plain new observation', async () => {
    queries.recordOfficialPrice
      .mockResolvedValueOnce({ action: 'insert', latest: undefined, closedPrevious: true })
      .mockResolvedValueOnce({ action: 'insert', latest: undefined, closedPrevious: false })
    const result = await ingestPrices(
      connector([
        { id: 'a', product: product('a') },
        { id: 'b', product: product('b') },
      ]),
      10,
    )
    expect(result).toMatchObject({ recorded: 2, priceChanges: 1, unchanged: 0 })
  })

  it('counts a same-day repeat with identical values as unchanged, not as a new price', async () => {
    queries.recordOfficialPrice.mockResolvedValue({ action: 'unchanged', latest: undefined, closedPrevious: false })
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result).toMatchObject({ recorded: 0, unchanged: 1, skipped: 0 })
  })

  it('counts a refreshed same-day price as recorded', async () => {
    queries.recordOfficialPrice.mockResolvedValue({ action: 'update-same-day', latest: undefined, closedPrevious: false })
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result).toMatchObject({ recorded: 1, unchanged: 0 })
  })

  it('skips, and does not record, a price older than what is already stored', async () => {
    queries.recordOfficialPrice.mockResolvedValue({ action: 'stale', latest: undefined, closedPrevious: false })
    const result = await ingestPrices(connector([{ id: 'a', product: product('a') }]), 10)
    expect(result).toMatchObject({ recorded: 0, skipped: 1 })
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

  it('asks the connector for the whole catalog only when the backfill says so', async () => {
    const c = connector([{ id: 'a', product: product('a') }])
    await ingestPrices(c, 10, { fullCatalog: true })
    expect(c.fetchProducts).toHaveBeenCalledWith(10, { deadline: undefined, fullCatalog: true })
  })

  it('reports progress per product, ending with everything done', async () => {
    const progress: [number, number][] = []
    await ingestPrices(connector([{ id: 'a', product: product('a') }, { id: 'b', product: product('b') }]), 10, {
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(progress).toEqual([[1, 2], [2, 2]])
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
    unchanged: 0,
    priceChanges: 0,
    truncated: false,
    errors: [],
    ...extra,
  })
  type Run = (limit: number, options?: { deadline?: number; part?: { index: number; count: number } }) => Promise<IngestResult>
  const entry = (source: IngestionSource, run: Run, parts = 1) => ({ source, run, parts })

  it('reads the part the cursor names and moves the cursor on', async () => {
    queries.getIngestionCursor.mockResolvedValue(2)
    const run = vi.fn<Run>(async () => ok({ part: '3/5' }))
    const results = await runPriceSources({ budgetMs: 1000, sources: [entry('billa', run, 5)] })
    expect(run).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ part: { index: 2, count: 5 } }))
    expect(queries.setIngestionCursor).toHaveBeenCalledWith('billa', 3)
    expect(results.billa).toMatchObject({ part: '3/5' })
  })

  it('wraps from the last part back to the first, and a stored cursor beyond a smaller part count', async () => {
    queries.getIngestionCursor.mockResolvedValue(4)
    const run = vi.fn<Run>(async () => ok())
    await runPriceSources({ budgetMs: 1000, sources: [entry('billa', run, 5)] })
    expect(queries.setIngestionCursor).toHaveBeenLastCalledWith('billa', 0)

    queries.getIngestionCursor.mockResolvedValue(9) // the part count was lowered since
    await runPriceSources({ budgetMs: 1000, sources: [entry('billa', run, 5)] })
    expect(run).toHaveBeenLastCalledWith(expect.any(Number), expect.objectContaining({ part: { index: 4, count: 5 } }))
  })

  it('moves on after a truncated run but retries the part after a failed one', async () => {
    await runPriceSources({ budgetMs: 1000, sources: [entry('billa', async () => ok({ truncated: true }), 5)] })
    expect(queries.setIngestionCursor).toHaveBeenCalledWith('billa', 1)

    queries.setIngestionCursor.mockClear()
    const results = await runPriceSources({
      budgetMs: 1000,
      sources: [entry('billa', async () => { throw new Error('site down') }, 5)],
    })
    expect(results.billa).toEqual({ error: 'site down' })
    expect(queries.setIngestionCursor).not.toHaveBeenCalled()
  })

  it('reads a single-part store whole, without a cursor', async () => {
    const run = vi.fn<Run>(async () => ok())
    await runPriceSources({ budgetMs: 1000, sources: [entry('lidl', run)] })
    expect(run.mock.calls[0][1]).not.toHaveProperty('part')
    expect(queries.getIngestionCursor).not.toHaveBeenCalled()
    expect(queries.setIngestionCursor).not.toHaveBeenCalled()
  })

  it('lets a caller cap the batch size of every source', async () => {
    const seen: number[] = []
    const run: Run = async (limit) => {
      seen.push(limit)
      return ok()
    }
    await runPriceSources({ limit: 7, budgetMs: 1000, sources: [entry('lidl', run), entry('penny', run)] })
    expect(seen).toEqual([7, 7])
  })

  it('splits the large catalogs into parts and reads Lidl and Penny whole', () => {
    const parts = Object.fromEntries(PRICE_SOURCES.map((source) => [source.source, source.parts]))
    expect(parts).toEqual({ lidl: 1, penny: 1, billa: 5, dm: 7, rohlik: 6, kosik: 7 })
  })

  it('runs only the requested source', async () => {
    const a = vi.fn(async () => ok())
    const b = vi.fn(async () => ok())
    const results = await runPriceSources({ only: 'penny', limit: 5, budgetMs: 1000, sources: [entry('lidl', a), entry('penny', b)] })
    expect(Object.keys(results)).toEqual(['penny'])
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith(5, expect.objectContaining({ deadline: expect.any(Number) }))
  })

  it('runs every source when none is requested, all sharing one deadline', async () => {
    const seen: (number | undefined)[] = []
    const run: Run = async (_limit, options) => {
      seen.push(options?.deadline)
      return ok()
    }
    const results = await runPriceSources({ limit: 5, budgetMs: 1000, now: () => 0, sources: [entry('lidl', run), entry('penny', run)] })
    expect(Object.keys(results)).toEqual(['lidl', 'penny'])
    expect(seen).toEqual([1000, 1000])
  })

  it('isolates a failing source from the others', async () => {
    const failing: Run = async () => {
      throw new Error('site changed')
    }
    const results = await runPriceSources({ limit: 5, budgetMs: 1000, sources: [entry('lidl', failing), entry('penny', async () => ok())] })
    expect(results.lidl).toEqual({ error: 'site changed' })
    expect(results.penny).toMatchObject({ recorded: 1 })
  })

  it('skips, rather than starts, a source once the budget is spent', async () => {
    let clock = 0
    const second = vi.fn(async () => ok())
    const first: Run = async () => {
      clock = 1500 // this source used up the whole budget
      return ok({ truncated: true })
    }
    const results = await runPriceSources({ limit: 5, budgetMs: 1000, now: () => clock, sources: [entry('lidl', first), entry('penny', second)] })
    expect(results.lidl).toMatchObject({ truncated: true })
    expect(results.penny).toEqual({ skipped: 'time budget exhausted before this source started' })
    expect(second).not.toHaveBeenCalled()
  })
})
