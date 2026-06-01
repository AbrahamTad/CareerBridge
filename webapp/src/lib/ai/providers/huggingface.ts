// Hugging Face router adapter for optional hosted chat-completion models.
import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeBaseUrl, normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'openai/gpt-oss-120b:cerebras'
const DEFAULT_BASE_URL = 'https://router.huggingface.co/v1'

function baseUrl() {
  return normalizeBaseUrl(getOptionalEnv('HUGGINGFACE_BASE_URL') ?? DEFAULT_BASE_URL)
}

export const huggingFaceProvider: AIProviderClient = {
  name: 'huggingface',
  envKey: 'HUGGINGFACE_API_KEY',
  modelEnvKey: 'HUGGINGFACE_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'HUGGINGFACE_BASE_URL',
  defaultBaseUrl: DEFAULT_BASE_URL,
  requiresApiKey: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'huggingface'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      // A missing optional key skips this provider without breaking later fallbacks.
      throw new AIProviderError('missing_api_key', provider, 'Missing HUGGINGFACE_API_KEY.')
    }

    const model = getOptionalEnv('HUGGINGFACE_MODEL') ?? DEFAULT_MODEL
    let response: Response
    try {
      response = await fetch(`${baseUrl()}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      // Normalize network failures so retry and provider-switch rules remain consistent.
      throw normalizeRequestError(provider, error, 'Hugging Face request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Hugging Face response format.')
    }
    return text.trim()
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
