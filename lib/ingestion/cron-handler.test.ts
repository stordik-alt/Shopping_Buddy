import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The handler is tested with the ingestion itself stubbed: what matters here is authentication,
// source selection and how outcomes map to HTTP status codes.
const ingest = vi.hoisted(() => ({
  PRICE_SOURCES: [{ source: 'lidl' }, { source: 'billa' }],
  runPriceSources: vi.fn(),
}))
vi.mock('@/lib/ingestion/ingest', () => ingest)

import { handleIngestCron } from '@/lib/ingestion/cron-handler'

const request = (authorization?: string) => new Request('https://app.test/api/cron/ingest-prices', { headers: authorization ? { authorization } : {} })
const ran = { processed: 1, recorded: 1, newProducts: 0, deals: 0, promotionsWithoutValidity: 0, skipped: 0, unchanged: 0, priceChanges: 0, truncated: false, errors: [] }

describe('handleIngestCron', () => {
  let logs: { info: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> }
  beforeEach(() => {
    logs = {
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    ingest.runPriceSources.mockReset()
    vi.stubEnv('CRON_SECRET', 'secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('rejects a request without the right bearer token, before doing any work', async () => {
    expect((await handleIngestCron(request())).status).toBe(401)
    expect((await handleIngestCron(request('Bearer wrong'))).status).toBe(401)
    expect(ingest.runPriceSources).not.toHaveBeenCalled()
  })

  it('rejects an unknown source with a 400 listing the valid ones', async () => {
    const response = await handleIngestCron(request('Bearer secret'), 'tesco')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Unknown source: tesco', sources: ['lidl', 'billa'] })
    expect(ingest.runPriceSources).not.toHaveBeenCalled()
  })

  it('runs the requested source inside the time budget', async () => {
    ingest.runPriceSources.mockResolvedValue({ billa: ran })
    const response = await handleIngestCron(request('Bearer secret'), 'billa')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ billa: ran })
    // No batch size is passed: each source reads its own (PRICE_SOURCES).
    expect(ingest.runPriceSources).toHaveBeenCalledWith({ only: 'billa', budgetMs: 230_000 })
  })

  it('runs every source when none is requested', async () => {
    ingest.runPriceSources.mockResolvedValue({ lidl: ran, billa: ran })
    await handleIngestCron(request('Bearer secret'))
    expect(ingest.runPriceSources).toHaveBeenCalledWith(expect.objectContaining({ only: undefined }))
  })

  it('answers 200 for a partial failure and shows which store failed', async () => {
    ingest.runPriceSources.mockResolvedValue({ lidl: { error: 'site changed' }, billa: ran })
    const response = await handleIngestCron(request('Bearer secret'))
    expect(response.status).toBe(200)
    expect((await response.json()).lidl).toEqual({ error: 'site changed' })
  })

  it('answers 502 only when every source that ran failed', async () => {
    ingest.runPriceSources.mockResolvedValue({ billa: { error: 'site changed' } })
    expect((await handleIngestCron(request('Bearer secret'), 'billa')).status).toBe(502)
  })

  it('answers 200 for a budget-truncated run, which is reported in its body', async () => {
    ingest.runPriceSources.mockResolvedValue({ billa: { ...ran, truncated: true } })
    const response = await handleIngestCron(request('Bearer secret'), 'billa')
    expect(response.status).toBe(200)
    expect((await response.json()).billa.truncated).toBe(true)
  })

  it('logs one line per source so a scheduled run can be inspected afterwards', async () => {
    ingest.runPriceSources.mockResolvedValue({ billa: ran })
    await handleIngestCron(request('Bearer secret'), 'billa')
    expect(logs.info).toHaveBeenCalledTimes(1)
    expect(JSON.parse(logs.info.mock.calls[0][0] as string)).toMatchObject({ event: 'price_ingest', source: 'billa', status: 'ok', recorded: 1 })
  })

  it('logs a truncated run as a warning and a failed source as an error', async () => {
    ingest.runPriceSources.mockResolvedValue({ lidl: { error: 'site changed' }, billa: { ...ran, truncated: true } })
    await handleIngestCron(request('Bearer secret'))
    expect(JSON.parse(logs.warn.mock.calls[0][0] as string)).toMatchObject({ source: 'billa', status: 'truncated' })
    expect(JSON.parse(logs.error.mock.calls[0][0] as string)).toMatchObject({ source: 'lidl', status: 'error', errors: ['site changed'] })
  })

  it('does not log anything for a rejected request', async () => {
    await handleIngestCron(request('Bearer wrong'))
    expect(logs.info).not.toHaveBeenCalled()
    expect(logs.warn).not.toHaveBeenCalled()
    expect(logs.error).not.toHaveBeenCalled()
  })

  it('runs unauthenticated only when no CRON_SECRET is configured (local development)', async () => {
    vi.stubEnv('CRON_SECRET', '')
    ingest.runPriceSources.mockResolvedValue({ billa: ran })
    expect((await handleIngestCron(request(), 'billa')).status).toBe(200)
  })
})
