// AI Sweden GPT-SW3 adapter using a Hugging Face-compatible inference endpoint.
import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeBaseUrl, normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'AI-Sweden-Models/gpt-sw3-356m'
const DEFAULT_HUGGING_FACE_BASE_URL = 'https://router.huggingface.co/v1'
// Keep the short environment value while resolving the hosted model identifier internally.
const MODEL_ALIASES: Record<string, string> = {
  'gpt-sw3': DEFAULT_MODEL,
}

function buildPrompt(system: string, user: string) {
  return `${system.trim()}\n\nUser request:\n${user.trim()}\n\nAnswer:`
}

// Accept direct text-generation and OpenAI-compatible completion response shapes.
function extractGeneratedText(data: unknown): string | null {
  if (Array.isArray(data)) {
    const first = data[0] as { generated_text?: unknown } | undefined
    return typeof first?.generated_text === 'string' ? first.generated_text : null
  }
  if (data && typeof data === 'object') {
    const record = data as {
      generated_text?: unknown
      generatedText?: unknown
      choices?: { text?: unknown; message?: { content?: unknown } }[]
    }
    if (typeof record.generated_text === 'string') return record.generated_text
    if (typeof record.generatedText === 'string') return record.generatedText
    const choice = record.choices?.[0]
    if (typeof choice?.message?.content === 'string') return choice.message.content
    if (typeof choice?.text === 'string') return choice.text
  }
  return null
}

function resolveModel(model: string) {
  return MODEL_ALIASES[model.toLowerCase()] ?? model
}

// GPT-SW3 is served as text generation by Featherless AI through the Hugging Face router.
function huggingFaceCompletionUrl(configured?: string) {
  const routerUrl = normalizeBaseUrl(configured ?? DEFAULT_HUGGING_FACE_BASE_URL)
  if (routerUrl.endsWith('/completions')) return routerUrl
  if (routerUrl.endsWith('/featherless-ai/v1')) return `${routerUrl}/completions`
  if (routerUrl.endsWith('/v1')) return `${routerUrl.slice(0, -3)}/featherless-ai/v1/completions`
  return `${routerUrl}/featherless-ai/v1/completions`
}

// Prefer a dedicated endpoint; Hugging Face routing is an explicit fallback mode.
function endpointForModel(model: string) {
  const configured = getOptionalEnv('AI_SWEDEN_BASE_URL') ?? getOptionalEnv('GPT_SW3_ENDPOINT')
  if (getOptionalEnv('AI_SWEDEN_PROVIDER')?.toLowerCase() === 'huggingface') {
    const baseUrl = normalizeBaseUrl(getOptionalEnv('HUGGINGFACE_BASE_URL') ?? DEFAULT_HUGGING_FACE_BASE_URL)
    return {
      url: huggingFaceCompletionUrl(configured ?? baseUrl),
      format: 'completion' as const,
    }
  }

  if (!configured) {
    throw new AIProviderError(
      'missing_configuration',
      'aisweden',
      'Set AI_SWEDEN_BASE_URL for a dedicated endpoint or AI_SWEDEN_PROVIDER=huggingface for hosted fallback.'
    )
  }

  const endpoint = configured.replace(/\/+$/, '')
  return {
    url: endpoint.endsWith('/models') ? `${endpoint}/${model}` : endpoint,
    format: 'text-generation' as const,
  }
}

export const aiSwedenProvider: AIProviderClient = {
  name: 'aisweden',
  envKey: 'AI_SWEDEN_API_KEY',
  modelEnvKey: 'AI_SWEDEN_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'AI_SWEDEN_BASE_URL',
  defaultBaseUrl: DEFAULT_HUGGING_FACE_BASE_URL,
  requiresApiKey: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'aisweden'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      // A typed missing-key error lets the fallback manager skip this optional provider.
      throw new AIProviderError('missing_api_key', provider, 'Missing AI_SWEDEN_API_KEY.')
    }

    const model = resolveModel(getOptionalEnv('AI_SWEDEN_MODEL') ?? getOptionalEnv('GPT_SW3_MODEL') ?? DEFAULT_MODEL)
    const endpoint = endpointForModel(model)

    let response: Response
    try {
      response = await fetch(endpoint.url, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(endpoint.format === 'completion'
          ? {
              model,
              prompt: buildPrompt(system, user),
              max_tokens: maxTokens,
              temperature: 0.2,
            }
          : {
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
      throw normalizeRequestError(provider, error, 'AI Sweden request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status, message), provider, message, response.status)
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
