import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real providers in lib/receipts.ts talk to Google Cloud Vision, Google STS/IAM, Azure
// Document Intelligence and (via the AI SDK) Gemini. None of those are called here: `fetch`, the
// Vercel OIDC helper and `generateObject` are all faked, so these tests pin down request
// construction, response parsing and error reporting without credentials, network or cost.
// (Real OCR/model output quality is a separate matter and is not covered by any test.)
const generateObjectMock = vi.fn()
vi.mock('ai', () => ({ generateObject: (...args: unknown[]) => generateObjectMock(...args) }))
const getVercelOidcTokenMock = vi.fn()
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: () => getVercelOidcTokenMock() }))

import {
  azureReceiptTextExtractor,
  geminiStructuringProvider,
  googleVisionPdfTextExtractor,
  googleVisionTextExtractor,
  isAzureReceiptFallbackConfigured,
  type ExtractedReceipt,
} from '@/lib/receipts'

const fetchMock = vi.fn<typeof fetch>()
const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const ENV_KEYS = [
  'GOOGLE_VISION_API_KEY',
  'GCP_PROJECT_ID',
  'GCP_PROJECT_NUMBER',
  'GCP_SERVICE_ACCOUNT_EMAIL',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT',
  'AZURE_DOCUMENT_INTELLIGENCE_KEY',
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  fetchMock.mockReset()
  generateObjectMock.mockReset()
  getVercelOidcTokenMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

const image = { base64: 'QUJD', mimeType: 'image/jpeg' }

/** Parses the JSON body of the n-th recorded fetch call. */
const requestBody = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1]?.body))

describe('googleVisionTextExtractor (images)', () => {
  it('fails clearly when the API key is not configured, without calling the network', async () => {
    await expect(googleVisionTextExtractor.extractText(image)).rejects.toThrow('GOOGLE_VISION_API_KEY is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests DOCUMENT_TEXT_DETECTION with the image content and returns the full text and its non-empty lines', async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key'
    fetchMock.mockResolvedValue(jsonResponse(200, { responses: [{ fullTextAnnotation: { text: 'LIDL\n\nMléko 24,90\nCelkem 24,90\n' } }] }))

    const result = await googleVisionTextExtractor.extractText(image)

    expect(result.fullText).toBe('LIDL\n\nMléko 24,90\nCelkem 24,90\n')
    expect(result.lines).toEqual(['LIDL', 'Mléko 24,90', 'Celkem 24,90'])
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://vision.googleapis.com/v1/images:annotate?key=test-key')
    expect(requestBody(0)).toEqual({ requests: [{ image: { content: 'QUJD' }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] })
  })

  it('reports an HTTP failure with its status and Google\'s message', async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key'
    fetchMock.mockResolvedValue(jsonResponse(403, { error: { message: 'API key not valid' } }))
    await expect(googleVisionTextExtractor.extractText(image)).rejects.toThrow('Google Vision request failed (403): API key not valid')
  })

  it('reports a per-image error returned inside an otherwise successful response', async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key'
    fetchMock.mockResolvedValue(jsonResponse(200, { responses: [{ error: { message: 'Bad image data' } }] }))
    await expect(googleVisionTextExtractor.extractText(image)).rejects.toThrow('Google Vision error: Bad image data')
  })

  it('throws rather than returning an empty result when no text was read', async () => {
    process.env.GOOGLE_VISION_API_KEY = 'test-key'
    fetchMock.mockResolvedValue(jsonResponse(200, { responses: [{}] }))
    await expect(googleVisionTextExtractor.extractText(image)).rejects.toThrow('Google Vision returned no readable text')
  })
})

describe('googleVisionPdfTextExtractor (Vercel OIDC → Google WIF)', () => {
  const pdf = { base64: 'UERG', mimeType: 'application/pdf' }
  const configureGcp = () => {
    process.env.GCP_PROJECT_ID = 'my-project'
    process.env.GCP_PROJECT_NUMBER = '123456'
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'vision@my-project.iam.gserviceaccount.com'
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = 'vercel-pool'
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = 'vercel-provider'
  }
  /** Routes each of the three Google calls; individual tests override one to force a failure. */
  const routeGoogle = (overrides: { sts?: Response; iam?: Response; vision?: Response } = {}) => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('https://sts.googleapis.com/')) return overrides.sts ?? jsonResponse(200, { access_token: 'sts-token' })
      if (url.startsWith('https://iamcredentials.googleapis.com/')) return overrides.iam ?? jsonResponse(200, { accessToken: 'sa-access-token' })
      if (url.startsWith('https://vision.googleapis.com/')) {
        return overrides.vision ?? jsonResponse(200, { responses: [{ responses: [{ fullTextAnnotation: { text: 'Strana 1' } }, { fullTextAnnotation: { text: 'Strana 2' } }] }] })
      }
      throw new Error('unexpected URL ' + url)
    })
  }

  it('lists every missing GCP setting when it is not configured, without calling the network', async () => {
    await expect(googleVisionPdfTextExtractor.extractText(pdf)).rejects.toThrow('GCP OIDC is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getVercelOidcTokenMock).not.toHaveBeenCalled()
  })

  it('fails when Vercel provides no OIDC token', async () => {
    configureGcp()
    getVercelOidcTokenMock.mockResolvedValue('')
    await expect(googleVisionPdfTextExtractor.extractText(pdf)).rejects.toThrow('Vercel OIDC token is not available')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exchanges the Vercel token, impersonates the service account, and sends the PDF with the resulting access token', async () => {
    configureGcp()
    getVercelOidcTokenMock.mockResolvedValue('vercel-oidc-jwt')
    routeGoogle()

    const result = await googleVisionPdfTextExtractor.extractText(pdf)

    // Pages of the PDF are joined in order; blank lines are dropped from `lines`.
    expect(result.fullText).toBe('Strana 1\nStrana 2')
    expect(result.lines).toEqual(['Strana 1', 'Strana 2'])

    const [sts, iam, vision] = fetchMock.mock.calls
    const stsParams = new URLSearchParams(String(sts[1]?.body))
    expect(stsParams.get('subject_token')).toBe('vercel-oidc-jwt')
    expect(stsParams.get('audience')).toBe('//iam.googleapis.com/projects/123456/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider')

    expect(String(iam[0])).toBe('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/vision%40my-project.iam.gserviceaccount.com:generateAccessToken')
    expect((iam[1]?.headers as Record<string, string>).Authorization).toBe('Bearer sts-token')

    expect(String(vision[0])).toBe('https://vision.googleapis.com/v1/files:annotate')
    const visionHeaders = vision[1]?.headers as Record<string, string>
    expect(visionHeaders.Authorization).toBe('Bearer sa-access-token')
    expect(visionHeaders['x-goog-user-project']).toBe('my-project')
    expect(requestBody(2)).toEqual({
      requests: [{ inputConfig: { content: 'UERG', mimeType: 'application/pdf' }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], pages: [1, 2, 3, 4, 5] }],
    })
  })

  it('reports a failed STS token exchange and stops before the later calls', async () => {
    configureGcp()
    getVercelOidcTokenMock.mockResolvedValue('vercel-oidc-jwt')
    routeGoogle({ sts: jsonResponse(400, { error: 'invalid_grant', error_description: 'audience mismatch' }) })

    await expect(googleVisionPdfTextExtractor.extractText(pdf)).rejects.toThrow('Google STS token exchange failed (400): audience mismatch')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a failed service-account impersonation', async () => {
    configureGcp()
    getVercelOidcTokenMock.mockResolvedValue('vercel-oidc-jwt')
    routeGoogle({ iam: jsonResponse(403, { error: { message: 'Permission iam.serviceAccounts.getAccessToken denied' } }) })

    await expect(googleVisionPdfTextExtractor.extractText(pdf)).rejects.toThrow('Google service-account impersonation failed (403): Permission iam.serviceAccounts.getAccessToken denied')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports a Vision API failure', async () => {
    configureGcp()
    getVercelOidcTokenMock.mockResolvedValue('vercel-oidc-jwt')
    routeGoogle({ vision: jsonResponse(500, { error: { message: 'Internal error' } }) })
    await expect(googleVisionPdfTextExtractor.extractText(pdf)).rejects.toThrow('Google Vision PDF request failed (500): Internal error')
  })

  it('throws when the PDF yielded no readable text', async () => {
    configureGcp()
    getVercelOidcTokenMock.mockResolvedValue('vercel-oidc-jwt')
    routeGoogle({ vision: jsonResponse(200, { responses: [{ responses: [{}] }] }) })
    await expect(googleVisionPdfTextExtractor.extractText(pdf)).rejects.toThrow('Google Vision returned no readable text from the PDF')
  })
})

describe('Azure Document Intelligence fallback', () => {
  const configureAzure = () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://example.cognitiveservices.azure.com/'
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'azure-key'
  }
  const submitted = () => new Response(null, { status: 202, headers: { 'Operation-Location': 'https://example.cognitiveservices.azure.com/operations/1' } })

  /** Runs the extractor under fake timers (it sleeps 500 ms between polls) and settles it. */
  async function run(): Promise<PromiseSettledResult<{ fullText: string; lines: string[] }>> {
    vi.useFakeTimers()
    const settled = azureReceiptTextExtractor.extractText(image).then(
      (value) => ({ status: 'fulfilled', value }) as const,
      (reason) => ({ status: 'rejected', reason }) as const,
    )
    // 20 polls × 500 ms is the extractor's hard cap; advance past it.
    await vi.advanceTimersByTimeAsync(20 * 500 + 1000)
    return settled
  }

  it('is only considered configured when both the endpoint and the key are set', () => {
    expect(isAzureReceiptFallbackConfigured()).toBe(false)
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://example.cognitiveservices.azure.com/'
    expect(isAzureReceiptFallbackConfigured()).toBe(false)
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'azure-key'
    expect(isAzureReceiptFallbackConfigured()).toBe(true)
  })

  it('refuses to run when not configured, without calling the network', async () => {
    await expect(azureReceiptTextExtractor.extractText(image)).rejects.toThrow('Azure Document Intelligence fallback is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits the base64 bytes (never a blob URL), polls until succeeded, and returns the analyzed content', async () => {
    configureAzure()
    fetchMock
      .mockResolvedValueOnce(submitted())
      .mockResolvedValueOnce(jsonResponse(200, { status: 'running' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'succeeded', analyzeResult: { content: '  LIDL\nMléko 24,90\n' } }))

    const outcome = await run()

    expect(outcome.status).toBe('fulfilled')
    if (outcome.status === 'fulfilled') {
      expect(outcome.value).toEqual({ fullText: 'LIDL\nMléko 24,90', lines: ['LIDL', 'Mléko 24,90'] })
    }
    // Trailing slash on the endpoint must not produce a double slash.
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('azure-key')
    expect(requestBody(0)).toEqual({ base64Source: 'QUJD' })
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://example.cognitiveservices.azure.com/operations/1')
  })

  it('reports a rejected submission with status and Azure\'s message', async () => {
    configureAzure()
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { message: 'Access denied due to invalid subscription key' } }))
    await expect(azureReceiptTextExtractor.extractText(image)).rejects.toThrow('Azure Document Intelligence request failed (401): Access denied due to invalid subscription key')
  })

  it('fails when Azure accepts the job but returns no Operation-Location to poll', async () => {
    configureAzure()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }))
    await expect(azureReceiptTextExtractor.extractText(image)).rejects.toThrow('did not return Operation-Location')
  })

  it('reports an analysis that Azure marks as failed', async () => {
    configureAzure()
    fetchMock.mockResolvedValueOnce(submitted()).mockResolvedValueOnce(jsonResponse(200, { status: 'failed', error: { message: 'Unsupported file' } }))
    const outcome = await run()
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') expect(String(outcome.reason)).toContain('analysis failed: Unsupported file')
  })

  it('reports a failing result request', async () => {
    configureAzure()
    fetchMock.mockResolvedValueOnce(submitted()).mockResolvedValueOnce(jsonResponse(500, { error: { message: 'Service unavailable' } }))
    const outcome = await run()
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') expect(String(outcome.reason)).toContain('result request failed (500): Service unavailable')
  })

  it('throws when a succeeded analysis contains no text', async () => {
    configureAzure()
    fetchMock.mockResolvedValueOnce(submitted()).mockResolvedValueOnce(jsonResponse(200, { status: 'succeeded', analyzeResult: { content: '   ' } }))
    const outcome = await run()
    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') expect(String(outcome.reason)).toContain('returned no readable text')
  })

  it('gives up after a bounded number of polls instead of hanging the import', async () => {
    configureAzure()
    fetchMock.mockResolvedValueOnce(submitted()).mockResolvedValue(jsonResponse(200, { status: 'running' }))

    const outcome = await run()

    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') expect(String(outcome.reason)).toContain('timed out')
    expect(fetchMock).toHaveBeenCalledTimes(1 + 20) // one submission + exactly 20 polls
  })
})

describe('geminiStructuringProvider', () => {
  const extraction: ExtractedReceipt = {
    store: { name: 'Lidl', confidence: 0.9 },
    date: '2026-09-22',
    time: null,
    receiptNumber: null,
    currency: 'CZK',
    items: [],
    subtotal: null,
    discountTotal: null,
    total: 24.9,
    confidence: 0.8,
  }

  it('sends the OCR text to the cheap structuring model with the receipt schema and returns the structured object', async () => {
    generateObjectMock.mockResolvedValue({ object: extraction })

    const result = await geminiStructuringProvider.structure('LIDL\nMléko 24,90')

    expect(result).toBe(extraction)
    const call = generateObjectMock.mock.calls[0][0]
    expect(call.model).toBe('google/gemini-2.5-flash-lite')
    expect(call.prompt).toContain('LIDL\nMléko 24,90')
    // The schema is what stops a malformed response from being returned as partial data.
    expect(call.schema.safeParse(extraction).success).toBe(true)
    expect(call.schema.safeParse({ ...extraction, total: 'not a number' }).success).toBe(false)
  })

  it('tells the model to output null rather than guess, and defines how discounts are reported', async () => {
    generateObjectMock.mockResolvedValue({ object: extraction })
    await geminiStructuringProvider.structure('x')
    const { prompt } = generateObjectMock.mock.calls[0][0]
    expect(prompt).toContain('Never invent or estimate a value')
    expect(prompt).toContain('output null')
    expect(prompt).toContain('BEFORE any discount')
    expect(prompt).toContain('sold by weight')
    expect(prompt).toContain('never derive the weight from the total')
    expect(prompt).toContain('Never output a discount')
  })

  it('lets a model/gateway failure propagate so the caller can record parsing_failed', async () => {
    generateObjectMock.mockRejectedValue(new Error('model overloaded'))
    await expect(geminiStructuringProvider.structure('x')).rejects.toThrow('model overloaded')
  })
})
