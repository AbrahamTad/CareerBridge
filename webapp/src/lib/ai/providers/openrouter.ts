import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeBaseUrl, normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'meta-llama/llama-3.1-8b-instruct'
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'

function baseUrl() {
  return normalizeBaseUrl(getOptionalEnv('OPENROUTER_BASE_URL') ?? DEFAULT_BASE_URL)
}

export const openrouterProvider: AIProviderClient = {
  name: 'openrouter',
  envKey: 'OPENROUTER_API_KEY',
  modelEnvKey: 'OPENROUTER_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'OPENROUTER_BASE_URL',
  defaultBaseUrl: DEFAULT_BASE_URL,
  requiresApiKey: true,
  priority: 5,
  supportsSwedish: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'openrouter'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing OPENROUTER_API_KEY.')
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl()}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          'http-referer': getOptionalEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000',
          'x-title': 'CareerBridge',
        },
        body: JSON.stringify({
          model: getOptionalEnv('OPENROUTER_MODEL') ?? DEFAULT_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      throw normalizeRequestError(provider, error, 'OpenRouter request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected OpenRouter response format.')
    }
    return text
  },
  async healthCheck(signal?: AbortSignal) {
    const result = await this.complete({
      system: 'Reply with OK only.',
      user: 'OK',
      maxTokens: 8,
      signal,
    })
    return result.trim().length > 0
  },
}
