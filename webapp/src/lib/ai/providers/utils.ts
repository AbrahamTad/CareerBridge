import { AIProviderError, type AIErrorCode, type AIProvider } from '../types'

export async function parseProviderError(response: Response): Promise<string> {
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

export function providerErrorCodeFromStatus(status: number): AIErrorCode {
  if (status === 401 || status === 403) return 'invalid_api_key'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'quota_exceeded'
  return 'request_failed'
}

export function normalizeRequestError(provider: AIProvider, error: unknown, fallback: string) {
  const code = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request_failed'
  return new AIProviderError(code, provider, error instanceof Error ? error.message : fallback)
}

export function sanitizeProviderMessage(message: string) {
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[masked]')
    .replace(/(x-goog-api-key["':\s]+)[A-Za-z0-9._~+/=-]+/gi, '$1[masked]')
    .replace(/(api[_-]?key["':\s=]+)[A-Za-z0-9._~+/=-]+/gi, '$1[masked]')
    .replace(/sk-[A-Za-z0-9._-]+/g, 'sk-[masked]')
}

export function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}
