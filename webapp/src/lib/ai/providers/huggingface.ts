import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { parseProviderError } from './utils'

const DEFAULT_MODEL = 'intfloat/multilingual-e5-large-instruct'

function buildPrompt(system: string, user: string) {
  return `${system.trim()}\n\nUser request:\n${user.trim()}\n\nAnswer:`
}

function extractText(data: unknown): string | null {
  if (Array.isArray(data)) {
    const first = data[0] as { generated_text?: unknown; summary_text?: unknown } | undefined
    if (typeof first?.generated_text === 'string') return first.generated_text
    if (typeof first?.summary_text === 'string') return first.summary_text
  }
  if (data && typeof data === 'object') {
    const record = data as { generated_text?: unknown; summary_text?: unknown }
    if (typeof record.generated_text === 'string') return record.generated_text
    if (typeof record.summary_text === 'string') return record.summary_text
  }
  return null
}

export const huggingFaceProvider: AIProviderClient = {
  name: 'huggingface',
  envKey: 'HUGGINGFACE_API_KEY',
  requiresApiKey: true,
  priority: 6,
  supportsSwedish: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'huggingface'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing HUGGINGFACE_API_KEY.')
    }

    const model = getOptionalEnv('HUGGINGFACE_MODEL') ?? DEFAULT_MODEL
    let response: Response
    try {
      response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          inputs: buildPrompt(system, user),
          parameters: {
            max_new_tokens: maxTokens,
            return_full_text: false,
            temperature: 0.2,
          },
          options: { wait_for_model: true },
        }),
      })
    } catch (error) {
      const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
      throw new AIProviderError(code, provider, error instanceof Error ? error.message : 'Hugging Face request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(response.status === 401 || response.status === 403 ? 'invalid_api_key' : 'request_failed', provider, message, response.status)
    }

    const data = await response.json()
    const text = extractText(data)
    if (!text) {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Hugging Face response format.')
    }
    return text.trim()
  },
  async healthCheck() {
    getAIProviderKey('huggingface')
    return true
  },
}
