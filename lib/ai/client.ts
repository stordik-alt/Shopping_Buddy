import { createOpenAI } from '@ai-sdk/openai'
import { generateText as sdkGenerateText } from 'ai'

export const DEFAULT_AI_MODEL = 'openai/gpt-6-luna'

export type GenerateAITextOptions = Omit<Parameters<typeof sdkGenerateText>[0], 'model'>

type GatewayConfig = {
  accountId: string
  token: string
}

function gatewayConfig(): GatewayConfig {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const token = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN?.trim()
  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !token && 'CLOUDFLARE_AI_GATEWAY_TOKEN',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Cloudflare AI Gateway is not configured. Missing: ${missing.join(', ')}`)
  }
  if (!/^[a-zA-Z0-9-]+$/.test(accountId!)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID has an invalid format')
  }

  return { accountId: accountId!, token: token! }
}

export function assertAIGatewayConfigured(): void {
  gatewayConfig()
}

function safeStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined
  const statusCode = error.statusCode
  return typeof statusCode === 'number' ? statusCode : undefined
}

export async function generateAIText<T extends GenerateAITextOptions>(options: T) {
  if (typeof window !== 'undefined') {
    throw new Error('Cloudflare AI Gateway requests are only available on the server')
  }

  const { accountId, token } = gatewayConfig()
  const baseURL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
  const model = createOpenAI({ baseURL, apiKey: token }).responses(DEFAULT_AI_MODEL)

  try {
    return await sdkGenerateText({ ...options, model } as Parameters<typeof sdkGenerateText>[0])
  } catch (error) {
    const statusCode = safeStatusCode(error)
    const errorType = error instanceof Error ? error.name : 'UnknownError'
    console.error('[ai] Cloudflare AI Gateway request failed', {
      model: DEFAULT_AI_MODEL,
      ...(statusCode ? { statusCode } : {}),
      errorType,
    })
    throw new Error(
      `Cloudflare AI Gateway request failed${statusCode ? ` (HTTP ${statusCode})` : ''}. Check gateway access and model availability.`,
    )
  }
}
