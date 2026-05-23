import { getOptionalEnv } from '@/lib/server/env'
import { AIProviderError, type AIErrorCode, type AIHealthSummary, type AIProvider, type CompletionRequest, type ProviderHealth } from './types'
import { getFallbackProvider, getProviderPriority } from './provider-router'
import { isProviderConfigured, providerClients } from './providers/index'

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_LOCAL_TIMEOUT_MS = 4_000
const DEFAULT_HEALTH_TIMEOUT_MS = 2_500
const MAX_ATTEMPTS_PER_PROVIDER = 2

function timeoutMs() {
  return Number(getOptionalEnv('AI_PROVIDER_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS
}

function localTimeoutMs() {
  return Number(getOptionalEnv('OLLAMA_TIMEOUT_MS')) || DEFAULT_LOCAL_TIMEOUT_MS
}

function providerTimeoutMs(provider: AIProvider) {
  return providerClients[provider].local ? localTimeoutMs() : timeoutMs()
}

function maxAttemptsForProvider(provider: AIProvider) {
  return providerClients[provider].local ? 1 : MAX_ATTEMPTS_PER_PROVIDER
}

function missingConfigurationCode(provider: AIProvider): AIErrorCode {
  return providerClients[provider].local ? 'missing_configuration' : 'missing_api_key'
}

function shouldRetryProvider(error: unknown) {
  if (!(error instanceof AIProviderError)) return true
  if (error.code === 'missing_api_key' || error.code === 'missing_configuration' || error.code === 'invalid_api_key') return false
  if (error.code === 'timeout') return true
  if (error.status === 429) return false
  return !error.status || error.status >= 500
}

function shouldTryNextProvider(error: unknown) {
  if (!(error instanceof AIProviderError)) return true
  if (error.code === 'missing_api_key' || error.code === 'missing_configuration' || error.code === 'invalid_api_key') return true
  return error.code === 'timeout' || error.code === 'invalid_response' || !error.status || error.status === 429 || error.status >= 500
}

function logProviderAttempt(
  provider: AIProvider,
  status: 'skipped' | 'success' | 'failed',
  startedAt: number,
  error?: unknown,
  attempt?: number
) {
  const providerError = error instanceof AIProviderError ? error : undefined
  const payload = {
    provider,
    status,
    attempt,
    code: providerError?.code,
    httpStatus: providerError?.status,
    message: providerError?.message,
    responseTimeMs: Date.now() - startedAt,
  }

  if (status === 'success') console.info('AI provider request succeeded', payload)
  else if (status === 'skipped') console.warn('AI provider skipped', payload)
  else console.warn('AI provider request failed', payload)
}

async function withTimeout<T>(callback: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await callback(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

export async function completeWithProviderFallback(request: CompletionRequest): Promise<string> {
  const providers = getProviderPriority(request)
  let lastError: unknown
  let skipped = 0
  let failed = 0

  for (const provider of providers) {
    const client = providerClients[provider]
    if (!isProviderConfigured(provider)) {
      const error = new AIProviderError(missingConfigurationCode(provider), provider, `Missing ${client.envKey}.`)
      lastError = error
      skipped += 1
      logProviderAttempt(provider, 'skipped', Date.now(), error)
      continue
    }

    const maxAttempts = maxAttemptsForProvider(provider)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = Date.now()
      try {
        const content = await withTimeout(
          (signal) => client.complete({ ...request, signal }),
          providerTimeoutMs(provider)
        )
        const trimmedContent = content.trim()
        if (!trimmedContent) {
          throw new AIProviderError('invalid_response', provider, `${client.name} returned an empty response.`)
        }
        logProviderAttempt(provider, 'success', startedAt, undefined, attempt)
        console.info('AI provider fallback selected provider', {
          provider,
          task: request.task,
          skippedProviders: skipped,
          failedAttempts: failed,
        })
        return trimmedContent
      } catch (error) {
        lastError = error
        failed += 1
        logProviderAttempt(provider, 'failed', startedAt, error, attempt)

        if (attempt < maxAttempts && shouldRetryProvider(error)) continue
        if (shouldTryNextProvider(error)) break
        throw error
      }
    }
  }

  console.error('All AI providers failed or were skipped', {
    task: request.task,
    providers,
    skippedProviders: skipped,
    failedAttempts: failed,
    lastError: lastError instanceof Error ? lastError.message : String(lastError ?? 'none'),
  })

  throw new AIProviderError(
    'all_unavailable',
    providers[0] ?? 'openai',
    'All AI providers failed or were skipped.'
  )
}

async function providerHealth(provider: AIProvider): Promise<ProviderHealth> {
  const client = providerClients[provider]
  const startedAt = Date.now()
  const configured = isProviderConfigured(provider)
  if (!configured) {
    return { provider, available: false, configured, local: client.local === true, responseTimeMs: Date.now() - startedAt, error: `Missing ${client.envKey}` }
  }

  try {
    const available = await withTimeout(
      (signal) => client.healthCheck ? client.healthCheck(signal) : Promise.resolve(true),
      DEFAULT_HEALTH_TIMEOUT_MS
    )
    return { provider, available, configured, local: client.local === true, responseTimeMs: Date.now() - startedAt }
  } catch (error) {
    return {
      provider,
      available: false,
      configured,
      local: client.local === true,
      responseTimeMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function getAIHealth(): Promise<AIHealthSummary> {
  const providers = await Promise.all(getProviderPriority().map(providerHealth))
  const activeProvider = providers.find((provider) => provider.available)?.provider ?? null
  const fallbackProvider = getFallbackProvider(activeProvider)
  const byProvider = Object.fromEntries(providers.map((provider) => [provider.provider, provider.available])) as Record<AIProvider, boolean>

  return {
    openai: byProvider.openai ?? false,
    anthropic: byProvider.anthropic ?? false,
    deepseek: byProvider.deepseek ?? false,
    groq: byProvider.groq ?? false,
    openrouter: byProvider.openrouter ?? false,
    aiSweden: byProvider.aisweden ?? false,
    huggingface: byProvider.huggingface ?? false,
    ollama: byProvider.ollama ?? false,
    activeProvider,
    fallbackProvider,
    providers,
  }
}
