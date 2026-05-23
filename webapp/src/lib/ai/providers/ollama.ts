import { getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { parseProviderError } from './utils'

const DEFAULT_MODEL = 'llama3.1'

function baseUrl() {
  return getOptionalEnv('OLLAMA_BASE_URL')?.replace(/\/$/, '')
}

export const ollamaProvider: AIProviderClient = {
  name: 'ollama',
  envKey: 'OLLAMA_BASE_URL',
  requiresApiKey: false,
  priority: 8,
  supportsSwedish: true,
  local: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'ollama'
    const url = baseUrl()
    if (!url) {
      throw new AIProviderError('missing_configuration', provider, 'Missing OLLAMA_BASE_URL.')
    }

    let response: Response
    try {
      response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: getOptionalEnv('OLLAMA_MODEL') ?? DEFAULT_MODEL,
          stream: false,
          options: { num_predict: maxTokens, temperature: 0.2 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
      const message = code === 'timeout'
        ? `Ollama timed out at ${url}. Check that the local server and model are available.`
        : `Ollama is not running at ${url}. Start Ollama, pull the configured model, or remove OLLAMA_BASE_URL to skip it.`
      throw new AIProviderError(code, provider, message)
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError('request_failed', provider, message, response.status)
    }

    const data = await response.json()
    const text = data?.message?.content
    if (typeof text !== 'string') {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Ollama response format.')
    }
    return text
  },
  async healthCheck(signal?: AbortSignal) {
    const url = baseUrl()
    if (!url) throw new AIProviderError('missing_configuration', 'ollama', 'Missing OLLAMA_BASE_URL.')
    const response = await fetch(`${url}/api/tags`, { signal })
    return response.ok
  },
}
