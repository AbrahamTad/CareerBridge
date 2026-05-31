import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

export const openaiProvider: AIProviderClient = {
  name: 'openai',
  envKey: 'OPENAI_API_KEY',
  modelEnvKey: 'OPENAI_MODEL',
  defaultModel: DEFAULT_OPENAI_MODEL,
  defaultBaseUrl: 'https://api.openai.com/v1',
  requiresApiKey: true,
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
      throw normalizeRequestError(provider, error, 'OpenAI request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected OpenAI response format.')
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
