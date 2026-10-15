import { createOpenAI } from '@ai-sdk/openai'
import { generateText as sdkGenerateText } from 'ai'

export const DEFAULT_AI_MODEL = 'openai/gpt-6-luna'

export type GenerateAITextOptions = Omit<Parameters<typeof sdkGenerateText>[0], 'model'>

type GatewayConfig = {
  accountId: string
  gatewayId: string
  token: string
}

function gatewayConfig(): GatewayConfig {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID?.trim()
  const token = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN?.trim()
  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !gatewayId && 'CLOUDFLARE_AI_GATEWAY_ID',
    !token && 'CLOUDFLARE_AI_GATEWAY_TOKEN',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Cloudflare AI Gateway is not configured. Missing: ${missing.join(', ')}`)
  }
  if (!/^[a-zA-Z0-9-]+$/.test(accountId!)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID has an invalid format')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(gatewayId!)) {
    throw new Error('CLOUDFLARE_AI_GATEWAY_ID has an invalid format')
  }

  return { accountId: accountId!, gatewayId: gatewayId!, token: token! }
}

export function assertAIGatewayConfigured(): void {
  gatewayConfig()
}

type ResponseModel = ReturnType<ReturnType<typeof createOpenAI>['responses']>

let cachedConfig: GatewayConfig | undefined
let cachedModel: ResponseModel | undefined

function gatewayModel(config: GatewayConfig): ResponseModel {
  if (
    cachedModel &&
    cachedConfig?.accountId === config.accountId &&
    cachedConfig.gatewayId === config.gatewayId &&
    cachedConfig.token === config.token
  ) {
    return cachedModel
  }

  // Cloudflare's account-scoped AI REST API supports the Responses API and third-party models;
  // cf-aig-gateway-id selects the Gateway whose stored provider credentials and policies apply.
  const provider = createOpenAI({
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1`,
    apiKey: config.token,
    headers: { 'cf-aig-gateway-id': config.gatewayId },
  })
  cachedConfig = config
  cachedModel = provider.responses(DEFAULT_AI_MODEL)
  return cachedModel
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

  const config = gatewayConfig()
  const model = gatewayModel(config)

  try {
    return await sdkGenerateText({ ...options, model } as Parameters<typeof sdkGenerateText>[0])
  } catch (error) {
    const statusCode = safeStatusCode(error)
    const errorType = error instanceof Error ? error.name : 'UnknownError'
    console.error('[ai] Cloudflare AI Gateway generation failed', {
      model: DEFAULT_AI_MODEL,
      ...(statusCode ? { statusCode } : {}),
      errorType,
    })
    const message = statusCode
      ? `Cloudflare AI Gateway request failed (HTTP ${statusCode}). Check gateway access and model availability.`
      : errorType === 'NoObjectGeneratedError' || errorType === 'NoOutputGeneratedError'
        ? 'Cloudflare AI Gateway returned no valid structured output.'
        : 'Cloudflare AI Gateway request failed before a response was received. Check network connectivity and gateway configuration.'
    throw new Error(message, { cause: error })
  }
}
