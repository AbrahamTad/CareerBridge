// Chooses provider order from explicit configuration and detected document language.
import { getConfiguredAIProvider } from '@/lib/server/env'
import { detectContentLanguage, prefersNordicModel } from './language-detector'
import type { AIProvider, CompletionRequest } from './types'
import { DEFAULT_PROVIDER_PRIORITY, SWEDISH_PROVIDER_PRIORITY } from './providers/index'

// Swedish content prefers Nordic-capable providers while preserving the configured override.
export function getProviderPriority(request?: Pick<CompletionRequest, 'system' | 'user' | 'languageHint'>): AIProvider[] {
  let configured: AIProvider | undefined
  try {
    configured = getConfiguredAIProvider()
  } catch (error) {
    console.warn('AI provider configuration is invalid; using default fallback chain', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const detectedLanguage = request?.languageHint ?? detectContentLanguage(request?.system, request?.user)
  const base = prefersNordicModel(detectedLanguage) ? SWEDISH_PROVIDER_PRIORITY : DEFAULT_PROVIDER_PRIORITY
  return configured ? [configured, ...base.filter((provider) => provider !== configured)] : base
}

export function getFallbackProvider(provider: AIProvider | null, request?: CompletionRequest) {
  const providers = getProviderPriority(request)
  if (!provider) return providers[1] ?? null
  const index = providers.indexOf(provider)
  return index >= 0 ? providers[index + 1] ?? null : providers[0] ?? null
}
