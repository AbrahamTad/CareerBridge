import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-haiku-latest'

export const anthropicProvider: AIProviderClient = {
  name: 'anthropic',
  envKey: 'ANTHROPIC_API_KEY',
  modelEnvKey: 'ANTHROPIC_MODEL',
  defaultModel: DEFAULT_ANTHROPIC_MODEL,
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  requiresApiKey: true,
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
      throw normalizeRequestError(provider, error, 'Anthropic request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.content?.find((item: { type?: string }) => item.type === 'text')?.text
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Anthropic response format.')
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
