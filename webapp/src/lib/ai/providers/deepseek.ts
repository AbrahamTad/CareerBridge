import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeBaseUrl, normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'

function baseUrl() {
  return normalizeBaseUrl(getOptionalEnv('DEEPSEEK_BASE_URL') ?? DEFAULT_BASE_URL)
}

export const deepseekProvider: AIProviderClient = {
  name: 'deepseek',
  envKey: 'DEEPSEEK_API_KEY',
  modelEnvKey: 'DEEPSEEK_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'DEEPSEEK_BASE_URL',
  defaultBaseUrl: DEFAULT_BASE_URL,
  requiresApiKey: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'deepseek'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing DEEPSEEK_API_KEY.')
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl()}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getOptionalEnv('DEEPSEEK_MODEL') ?? DEFAULT_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      throw normalizeRequestError(provider, error, 'DeepSeek request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected DeepSeek response format.')
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
