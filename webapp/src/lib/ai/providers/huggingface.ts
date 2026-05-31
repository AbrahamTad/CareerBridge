// Hugging Face inference adapter for optional hosted text-generation models.
import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeBaseUrl, normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'HuggingFaceH4/zephyr-7b-beta'
const DEFAULT_BASE_URL = 'https://api-inference.huggingface.co'

function buildPrompt(system: string, user: string) {
  return `${system.trim()}\n\nUser request:\n${user.trim()}\n\nAnswer:`
}

// Accept common generation and summarization response shapes from hosted models.
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

// Hugging Face inference routes are model-specific even when a shared base URL is configured.
function endpointForModel(model: string) {
  const baseUrl = normalizeBaseUrl(getOptionalEnv('HUGGINGFACE_BASE_URL') ?? DEFAULT_BASE_URL)
  return baseUrl.endsWith('/models') ? `${baseUrl}/${model}` : `${baseUrl}/models/${model}`
}

export const huggingFaceProvider: AIProviderClient = {
  name: 'huggingface',
  envKey: 'HUGGINGFACE_API_KEY',
  modelEnvKey: 'HUGGINGFACE_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'HUGGINGFACE_BASE_URL',
  defaultBaseUrl: DEFAULT_BASE_URL,
  requiresApiKey: true,
  priority: 7,
  supportsSwedish: true,
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
      response = await fetch(endpointForModel(model), {
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
      // Normalize network failures so retry and provider-switch rules remain consistent.
      throw normalizeRequestError(provider, error, 'Hugging Face request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = extractText(data)
    if (!text) {
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
