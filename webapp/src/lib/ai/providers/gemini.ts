import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIProviderClient, type ProviderRequest } from '../types'
import { normalizeBaseUrl, normalizeRequestError, parseProviderError, providerErrorCodeFromStatus } from './utils'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

function extractText(data: unknown): string | null {
  const candidate = Array.isArray((data as { candidates?: unknown })?.candidates)
    ? (data as { candidates: unknown[] }).candidates[0]
    : null
  const parts = (candidate as { content?: { parts?: unknown[] } } | null)?.content?.parts
  if (!Array.isArray(parts)) return null

  const text = parts
    .map((part) => (part && typeof part === 'object' ? (part as { text?: unknown }).text : null))
    .filter((part): part is string => typeof part === 'string')
    .join('')
    .trim()

  return text || null
}

function baseUrl() {
  return normalizeBaseUrl(getOptionalEnv('GEMINI_BASE_URL') ?? DEFAULT_BASE_URL)
}

export const geminiProvider: AIProviderClient = {
  name: 'gemini',
  envKey: 'GEMINI_API_KEY',
  modelEnvKey: 'GEMINI_MODEL',
  defaultModel: DEFAULT_MODEL,
  baseUrlEnvKey: 'GEMINI_BASE_URL',
  defaultBaseUrl: DEFAULT_BASE_URL,
  requiresApiKey: true,
  async complete({ system, user, maxTokens, signal }: ProviderRequest) {
    const provider = 'gemini'
    let apiKey: string
    try {
      apiKey = getAIProviderKey(provider)
    } catch {
      throw new AIProviderError('missing_api_key', provider, 'Missing GEMINI_API_KEY.')
    }

    const model = getOptionalEnv('GEMINI_MODEL') ?? DEFAULT_MODEL
    let response: Response
    try {
      response = await fetch(`${baseUrl()}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: user }],
            },
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.2,
          },
        }),
      })
    } catch (error) {
      throw normalizeRequestError(provider, error, 'Gemini request could not be sent.')
    }

    if (!response.ok) {
      const message = await parseProviderError(response)
      throw new AIProviderError(providerErrorCodeFromStatus(response.status), provider, message, response.status)
    }

    const data = await response.json()
    const text = extractText(data)
    if (!text) {
      throw new AIProviderError('invalid_response', provider, 'Unexpected Gemini response format.')
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
