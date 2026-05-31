import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'AI-Sweden-Models/gpt-sw3-6.7b-v2-instruct'
const MODEL_ALIASES: Record<string, string> = {
  'gpt-sw3': DEFAULT_MODEL,
}

function buildPrompt(system: string, user: string) {
  return `${system.trim()}\n\nUser request:\n${user.trim()}\n\nAnswer:`
}

function extractGeneratedText(data: unknown): string | null {
  if (Array.isArray(data)) {
    const first = data[0] as { generated_text?: unknown } | undefined
    return typeof first?.generated_text === 'string' ? first.generated_text : null
  }
  if (data && typeof data === 'object') {
    const record = data as { generated_text?: unknown; generatedText?: unknown }
    if (typeof record.generated_text === 'string') return record.generated_text
    if (typeof record.generatedText === 'string') return record.generatedText
  }
  return null
}

function resolveModel(model: string) {
  return MODEL_ALIASES[model.toLowerCase()] ?? model
}

function endpointForModel(model: string) {
  const configured = getOptionalEnv('AI_SWEDEN_BASE_URL') ?? getOptionalEnv('GPT_SW3_ENDPOINT')
  if (!configured) return `https://api-inference.huggingface.co/models/${model}`

  const endpoint = configured.replace(/\/+$/, '')
  if (endpoint.includes('/models/')) return endpoint
  if (endpoint.endsWith('/models') || endpoint === 'https://api-inference.huggingface.co') {
    return `${endpoint}${endpoint.endsWith('/models') ? '' : '/models'}/${model}`
  }
  return endpoint
}

export const aiSwedenProvider: AIProviderClient = {
  name: 'aisweden',
  envKey: 'AI_SWEDEN_API_KEY',
  modelEnvKey: 'AI_SWEDEN_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'AI_SWEDEN_BASE_URL',
  defaultBaseUrl: `https://api-inference.huggingface.co/models/${DEFAULT_MODEL}`,
  requiresApiKey: true,
  priority: 8,
  supportsSwedish: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'aisweden'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing AI_SWEDEN_API_KEY.')
    }

    const model = resolveModel(getOptionalEnv('AI_SWEDEN_MODEL') ?? getOptionalEnv('GPT_SW3_MODEL') ?? DEFAULT_MODEL)
    const endpoint = endpointForModel(model)

    let response: Response
    try {
      response = await fetch(endpoint, {
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
      throw normalizeRequestError(provider, error, 'AI Sweden request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = extractGeneratedText(data)
    if (!text) {
      throw new AIProviderError('invalid_response', provider, 'Unexpected AI Sweden response format.')
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
