import { getAIProviderKey, getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type ProviderRequest } from './types'

const DEFAULT_GPT_SW3_MODEL = 'AI-Sweden-Models/gpt-sw3-6.7b-v2-instruct'

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

export async function gptSw3Provider({ system, user, maxTokens, signal }: ProviderRequest): Promise<string> {
  const provider = 'aisweden'
  let apiKey: string
  try {
    apiKey = getAIProviderKey(provider)
  } catch {
    throw new AIProviderError('missing_api_key', provider, 'Missing AI_SWEDEN_API_KEY.')
  }
  const endpoint =
    getOptionalEnv('GPT_SW3_ENDPOINT') ??
    `https://api-inference.huggingface.co/models/${getOptionalEnv('GPT_SW3_MODEL') ?? DEFAULT_GPT_SW3_MODEL}`

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
        options: {
          wait_for_model: true,
        },
      }),
    })
  } catch (error) {
    const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
    throw new AIProviderError(
      code,
      provider,
      error instanceof Error ? error.message : 'GPT-SW3 request could not be sent.'
    )
  }

  if (!response.ok) {
    const message = await parseProviderError(response)
    throw new AIProviderError(response.status === 401 || response.status === 403 ? 'invalid_api_key' : 'request_failed', provider, message, response.status)
  }

  const data = await response.json()
  const text = extractGeneratedText(data)
  if (!text) {
    throw new AIProviderError('request_failed', provider, 'Unexpected Hugging Face GPT-SW3 response format.')
  }

  return text.trim()
}
