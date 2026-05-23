import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { parseProviderError } from './utils'

const DEFAULT_MODEL = 'llama-3.1-8b-instant'
const BASE_URL = 'https://api.groq.com/openai/v1'

export const groqProvider: AIProviderClient = {
  name: 'groq',
  envKey: 'GROQ_API_KEY',
  requiresApiKey: true,
  priority: 4,
  supportsSwedish: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'groq'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing GROQ_API_KEY.')
    }

    let response: Response
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getOptionalEnv('GROQ_MODEL') ?? DEFAULT_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
      throw new AIProviderError(code, provider, error instanceof Error ? error.message : 'Groq request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(response.status === 401 ? 'invalid_api_key' : 'request_failed', provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Groq response format.')
    }
    return text
  },
  async healthCheck() {
    getAIProviderKey('groq')
    return true
  },
}
