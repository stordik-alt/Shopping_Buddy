import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createOpenAIMock, generateTextMock, responsesMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  generateTextMock: vi.fn(),
  responsesMock: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }))
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateText: generateTextMock }
})

import { assertAIGatewayConfigured, DEFAULT_AI_MODEL, generateAIText } from '@/lib/ai/client'

const savedAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
const savedToken = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN

beforeEach(() => {
  delete process.env.CLOUDFLARE_ACCOUNT_ID
  delete process.env.CLOUDFLARE_AI_GATEWAY_TOKEN
  createOpenAIMock.mockReset()
  generateTextMock.mockReset()
  responsesMock.mockReset()
  createOpenAIMock.mockReturnValue({ responses: responsesMock })
  responsesMock.mockReturnValue({ modelId: DEFAULT_AI_MODEL })
})

afterEach(() => {
  if (savedAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID
  else process.env.CLOUDFLARE_ACCOUNT_ID = savedAccountId
  if (savedToken === undefined) delete process.env.CLOUDFLARE_AI_GATEWAY_TOKEN
  else process.env.CLOUDFLARE_AI_GATEWAY_TOKEN = savedToken
  vi.restoreAllMocks()
})

describe('Cloudflare AI Gateway client', () => {
  it('requires both server-side configuration values before making a request', async () => {
    expect(() => assertAIGatewayConfigured()).toThrow(
      'Cloudflare AI Gateway is not configured. Missing: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_GATEWAY_TOKEN',
    )
    await expect(generateAIText({ prompt: 'test' } as never)).rejects.toThrow('CLOUDFLARE_ACCOUNT_ID')
    expect(createOpenAIMock).not.toHaveBeenCalled()
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('uses the Cloudflare REST endpoint and the fixed GPT-6 Luna model', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account-123'
    process.env.CLOUDFLARE_AI_GATEWAY_TOKEN = 'gateway-token'
    generateTextMock.mockResolvedValue({ text: 'ok' })

    await generateAIText({ prompt: 'hello' } as never)

    expect(createOpenAIMock).toHaveBeenCalledWith({
      baseURL: 'https://api.cloudflare.com/client/v4/accounts/account-123/ai/v1',
      apiKey: 'gateway-token',
    })
    expect(responsesMock).toHaveBeenCalledWith('openai/gpt-6-luna')
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'hello', model: { modelId: DEFAULT_AI_MODEL } }),
    )
  })

  it('logs only safe error metadata and returns a sanitized failure', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'account-123'
    process.env.CLOUDFLARE_AI_GATEWAY_TOKEN = 'do-not-log-this-token'
    const providerError = Object.assign(new Error('request echoed do-not-log-this-token'), { statusCode: 401 })
    generateTextMock.mockRejectedValue(providerError)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(generateAIText({ prompt: 'private receipt text' } as never)).rejects.toThrow(
      'Cloudflare AI Gateway request failed (HTTP 401). Check gateway access and model availability.',
    )

    const logOutput = JSON.stringify(log.mock.calls)
    expect(logOutput).not.toContain('do-not-log-this-token')
    expect(logOutput).not.toContain('private receipt text')
    expect(log).toHaveBeenCalledWith('[ai] Cloudflare AI Gateway request failed', {
      model: DEFAULT_AI_MODEL,
      statusCode: 401,
      errorType: 'Error',
    })
  })
})
