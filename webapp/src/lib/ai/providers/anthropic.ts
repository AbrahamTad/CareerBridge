import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6'

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

export const anthropicProvider: AIProviderClient = {
  name: 'anthropic',
  envKey: 'ANTHROPIC_API_KEY',
  requiresApiKey: true,
  priority: 7,
  supportsSwedish: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest): Promise<string> {
    const provider = 'anthropic'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing ANTHROPIC_API_KEY.')
    }

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: getOptionalEnv('ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      })
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
      throw new AIProviderError(
        code,
        provider,
        error instanceof Error ? error.message : 'Anthropic request could not be sent.'
      )
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(response.status === 401 ? 'invalid_api_key' : 'request_failed', provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.content?.find((item: { type?: string }) => item.type === 'text')?.text
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Anthropic response format.')
    }

    return text
  },
  async healthCheck() {
    getAIProviderKey('anthropic')
    return true
  },
}
