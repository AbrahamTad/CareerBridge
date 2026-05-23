import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { parseProviderError } from './utils'

const DEFAULT_MODEL = 'meta-llama/llama-3.1-8b-instruct'
const BASE_URL = 'https://openrouter.ai/api/v1'

export const openrouterProvider: AIProviderClient = {
  name: 'openrouter',
  envKey: 'OPENROUTER_API_KEY',
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
      response = await fetch(`${BASE_URL}/chat/completions`, {
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
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
      throw new AIProviderError(code, provider, error instanceof Error ? error.message : 'OpenRouter request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(response.status === 401 ? 'invalid_api_key' : 'request_failed', provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected OpenRouter response format.')
    }
    return text
  },
  async healthCheck() {
    getAIProviderKey('openrouter')
    return true
  },
}
