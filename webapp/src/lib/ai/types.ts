// Shared AI provider contracts for routing, retries, health diagnostics, and task selection.
import type { AIProvider } from '@/lib/server/env'

export type { AIProvider }

export type AIErrorCode =
  | 'missing_api_key'
  | 'missing_configuration'
  | 'invalid_api_key'
  | 'insufficient_permissions'
  | 'quota_exceeded'
  | 'request_failed'
  | 'server_offline'
  | 'timeout'
  | 'all_unavailable'
  | 'invalid_response'

export type AIProviderCheckStatus =
  | 'working'
  | 'missing key'
  | 'invalid key'
  | 'insufficient permissions'
  | 'quota exceeded'
  | 'timeout'
  | 'server offline'
  | 'skipped'
  | 'unknown error'

export type ContentLanguage = 'sv' | 'en' | 'mixed' | 'unknown'

export interface CompletionRequest {
  system: string
  user: string
  maxTokens: number
  languageHint?: ContentLanguage
  task?:
    | 'cv-analysis'
    | 'job-match'
    | 'cover-letter'
    | 'lia-praktik-letter'
    | 'email-application'
    | 'cv-adapt'
    | 'job-search'
    | 'profession-recommendation'
    | 'swedish-language-improvement'
    | 'upskilling'
    | 'company-discovery'
}

export interface ProviderRequest extends CompletionRequest {
  signal?: AbortSignal
}

export interface AIProviderClient {
  name: AIProvider
  envKey: string
  modelEnvKey?: string
  defaultModel?: string
  baseUrlEnvKey?: string
  defaultBaseUrl?: string
  requiresApiKey: boolean
  local?: boolean
  complete(request: ProviderRequest): Promise<string>
  healthCheck?(signal?: AbortSignal): Promise<boolean>
}

export interface ProviderHealth {
  provider: AIProvider
  available: boolean
  configured: boolean
  local: boolean
  envKey: string
  model: string
  checkedAt: string
  checkStatus: AIProviderCheckStatus
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
  gemini: boolean
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

// Typed provider failures allow the manager to decide whether to retry or switch providers.
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
