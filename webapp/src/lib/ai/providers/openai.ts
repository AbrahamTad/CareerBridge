import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

async function parseProviderError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    if (typeof data?.error?.message === 'string') return data.error.message
    if (typeof data?.error === 'string') return data.error
    if (typeof data?.message === 'string') return data.message
  } catch {
    // Provider error bodies are not guaranteed to be JSON.
  }

  return response.statusText || 'Provider request failed'
}

export const openaiProvider: AIProviderClient = {
  name: 'openai',
  envKey: 'OPENAI_API_KEY',
  requiresApiKey: true,
  priority: 1,
  supportsSwedish: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest): Promise<string> {
    const provider = 'openai'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing OPENAI_API_KEY.')
    }

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getOptionalEnv('OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
      throw new AIProviderError(
        code,
        provider,
        error instanceof Error ? error.message : 'OpenAI request could not be sent.'
      )
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(response.status === 401 ? 'invalid_api_key' : 'request_failed', provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected OpenAI response format.')
    }

    return text
  },
  async healthCheck() {
    getAIProviderKey('openai')
    return true
  },
}
