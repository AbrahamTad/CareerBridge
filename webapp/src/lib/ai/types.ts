import type { AIProvider } from '@/lib/server/env'

export type { AIProvider }

export type AIErrorCode =
  | 'missing_api_key'
  | 'missing_configuration'
  | 'invalid_api_key'
  | 'request_failed'
  | 'timeout'
  | 'all_unavailable'
  | 'invalid_response'

export type ContentLanguage = 'sv' | 'en' | 'mixed' | 'unknown'

export interface CompletionRequest {
  system: string
  user: string
  maxTokens: number
  languageHint?: ContentLanguage
  task?: 'cv-analysis' | 'job-match' | 'cover-letter' | 'cv-adapt' | 'job-search' | 'company-discovery'
}

export interface ProviderRequest extends CompletionRequest {
  signal?: AbortSignal
}

export interface AIProviderClient {
  name: AIProvider
  envKey: string
  requiresApiKey: boolean
  priority: number
  supportsSwedish?: boolean
  local?: boolean
  complete(request: ProviderRequest): Promise<string>
  healthCheck?(signal?: AbortSignal): Promise<boolean>
}

export interface ProviderAttemptLog {
  provider: AIProvider
  status: 'skipped' | 'success' | 'failed'
  code?: AIErrorCode
  httpStatus?: number
  responseTimeMs: number
}

export interface ProviderHealth {
  provider: AIProvider
  available: boolean
  configured: boolean
  local: boolean
  responseTimeMs: number
  status: 'working' | 'warning' | 'unavailable'
  lastSuccessAt?: string
  lastErrorAt?: string
  lastError?: string
  lastErrorCode?: AIErrorCode
  lastHttpStatus?: number
  disabledUntil?: string
  score: number
  error?: string
}

export interface AIHealthSummary {
  openai: boolean
  anthropic: boolean
  deepseek: boolean
  groq: boolean
  openrouter: boolean
  aiSweden: boolean
  huggingface: boolean
  ollama: boolean
  activeProvider: AIProvider | null
  fallbackProvider: AIProvider | null
  providers: ProviderHealth[]
  checkedAt: string
  configuredProviders: number
  workingProviders: number
}

export class AIProviderError extends Error {
  constructor(
    public code: AIErrorCode,
    public provider: AIProvider,
    message: string,
    public status?: number
  ) {
    super(message)
    this.name = 'AIProviderError'
  }
}
