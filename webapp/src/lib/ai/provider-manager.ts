import { getOptionalEnv, logAIEnvironmentDiagnostics } from '@/lib/server/env'
import { AIProviderError, type AIErrorCode, type AIHealthSummary, type AIProvider, type AIProviderCheckStatus, type CompletionRequest, type ProviderHealth } from './types'
import { getFallbackProvider, getProviderPriority } from './provider-router'
import { isProviderConfigured, providerClients } from './providers/index'
import { sanitizeProviderMessage } from './providers/utils'

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_LOCAL_TIMEOUT_MS = 4_000
const DEFAULT_HEALTH_TIMEOUT_MS = 10_000
const MAX_ATTEMPTS_PER_PROVIDER = 2
const providerState = new Map<AIProvider, {
  lastSuccessAt?: string
  lastCheckedAt?: string
  lastErrorAt?: string
  lastError?: string
  lastErrorCode?: AIErrorCode
  lastHttpStatus?: number
  lastResponseTimeMs?: number
  lastCheckStatus?: AIProviderCheckStatus
  disabledUntil?: string
}>()

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
  if (error.code === 'quota_exceeded' || error.status === 429) return false
  return !error.status || error.status >= 500
}

function shouldTryNextProvider(error: unknown) {
  if (!(error instanceof AIProviderError)) return true
  if (error.code === 'missing_api_key' || error.code === 'missing_configuration' || error.code === 'invalid_api_key') return true
  return error.code === 'quota_exceeded' || error.code === 'server_offline' || error.code === 'timeout' || error.code === 'invalid_response' || !error.status || error.status === 429 || error.status >= 500
}

function checkStatusFromError(error: unknown, local: boolean): AIProviderCheckStatus {
  if (!(error instanceof AIProviderError)) return 'unknown error'
  if (error.code === 'missing_api_key' || error.code === 'missing_configuration') return local ? 'skipped' : 'missing key'
  if (error.code === 'invalid_api_key') return 'invalid key'
  if (error.code === 'quota_exceeded' || error.status === 429) return 'quota exceeded'
  if (error.code === 'timeout') return 'timeout'
  if (error.code === 'request_failed' && !error.status) return 'server offline'
  if (error.code === 'server_offline' || (local && error.code === 'request_failed')) return 'server offline'
  return 'unknown error'
}

function statusFromCheckStatus(checkStatus: AIProviderCheckStatus): ProviderHealth['status'] {
  return checkStatus === 'working'
    ? 'working'
    : checkStatus === 'quota exceeded' || checkStatus === 'timeout'
      ? 'warning'
      : 'unavailable'
}

function modelForProvider(provider: AIProvider) {
  const client = providerClients[provider]
  return client.modelEnvKey ? getOptionalEnv(client.modelEnvKey) ?? client.defaultModel ?? '' : client.defaultModel ?? ''
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
    message: providerError?.message ? sanitizeProviderMessage(providerError.message) : undefined,
    responseTimeMs: Date.now() - startedAt,
  }

  if (status === 'success') console.info('AI provider request succeeded', payload)
  else if (status === 'skipped') console.warn('AI provider skipped', payload)
  else console.warn('AI provider request failed', payload)
}

function recordProviderAttempt(
  provider: AIProvider,
  status: 'success' | 'failed' | 'skipped',
  responseTimeMs: number,
  error?: unknown
) {
  const current = providerState.get(provider) ?? {}
  const providerError = error instanceof AIProviderError ? error : undefined

  if (status === 'success') {
    providerState.set(provider, {
      ...current,
      lastSuccessAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      lastResponseTimeMs: responseTimeMs,
      lastCheckStatus: 'working',
      disabledUntil: undefined,
    })
    return
  }

  const disabledMs =
    providerError?.code === 'quota_exceeded' || providerError?.status === 429 ? 120_000
    : providerError?.code === 'timeout' ? 60_000
    : providerError?.provider === 'ollama' && (providerError.code === 'request_failed' || providerError.code === 'server_offline') ? 60_000
    : 0

  providerState.set(provider, {
    ...current,
    lastCheckedAt: new Date().toISOString(),
    lastErrorAt: new Date().toISOString(),
    lastError: sanitizeProviderMessage(error instanceof Error ? error.message : String(error ?? 'Provider unavailable')),
    lastErrorCode: providerError?.code,
    lastHttpStatus: providerError?.status,
    lastResponseTimeMs: responseTimeMs,
    lastCheckStatus: checkStatusFromError(error, providerClients[provider].local === true),
    disabledUntil: disabledMs > 0 ? new Date(Date.now() + disabledMs).toISOString() : current.disabledUntil,
  })
}

function getDisabledUntil(provider: AIProvider) {
  const disabledUntil = providerState.get(provider)?.disabledUntil
  if (!disabledUntil) return null

  if (new Date(disabledUntil).getTime() <= Date.now()) {
    providerState.set(provider, { ...(providerState.get(provider) ?? {}), disabledUntil: undefined })
    return null
  }

  return disabledUntil
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
  logAIEnvironmentDiagnostics()
  const providers = getProviderPriority(request)
  let lastError: unknown
  let skipped = 0
  let failed = 0

  for (const provider of providers) {
    const client = providerClients[provider]
    const disabledUntil = getDisabledUntil(provider)
    if (disabledUntil) {
      const error = new AIProviderError('request_failed', provider, `Provider temporarily disabled until ${disabledUntil}.`)
      skipped += 1
      recordProviderAttempt(provider, 'skipped', 0, error)
      logProviderAttempt(provider, 'skipped', Date.now(), error)
      continue
    }

    if (!isProviderConfigured(provider)) {
      const error = new AIProviderError(missingConfigurationCode(provider), provider, `Missing ${client.envKey}.`)
      lastError = error
      skipped += 1
      recordProviderAttempt(provider, 'skipped', 0, error)
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
        const responseTimeMs = Date.now() - startedAt
        recordProviderAttempt(provider, 'success', responseTimeMs)
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
        recordProviderAttempt(provider, 'failed', Date.now() - startedAt, error)
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
    lastError: sanitizeProviderMessage(lastError instanceof Error ? lastError.message : String(lastError ?? 'none')),
  })

  throw new AIProviderError(
    'all_unavailable',
    providers[0] ?? 'gemini',
    'All AI providers failed or were skipped.'
  )
}

async function providerHealth(provider: AIProvider): Promise<ProviderHealth> {
  const client = providerClients[provider]
  const startedAt = Date.now()
  const configured = isProviderConfigured(provider)
  const state = providerState.get(provider)
  const checkedAt = new Date().toISOString()
  const base = {
    provider,
    configured,
    local: client.local === true,
    envKey: client.envKey,
    model: modelForProvider(provider),
    checkedAt,
    lastSuccessAt: state?.lastSuccessAt,
    lastCheckedAt: state?.lastCheckedAt,
    lastErrorAt: state?.lastErrorAt,
    lastError: state?.lastError,
    lastErrorCode: state?.lastErrorCode,
    lastHttpStatus: state?.lastHttpStatus,
    disabledUntil: getDisabledUntil(provider) ?? undefined,
  }

  if (!configured) {
    const error = new AIProviderError(missingConfigurationCode(provider), provider, `Missing ${client.envKey}.`)
    const checkStatus = checkStatusFromError(error, client.local === true)
    recordProviderAttempt(provider, 'skipped', Date.now() - startedAt, error)
    return {
      ...base,
      available: false,
      responseTimeMs: Date.now() - startedAt,
      status: statusFromCheckStatus(checkStatus),
      checkStatus,
      score: 0,
      error: `Missing ${client.envKey}`,
    }
  }

  try {
    const available = await withTimeout(
      (signal) => client.healthCheck ? client.healthCheck(signal) : Promise.resolve(true),
      DEFAULT_HEALTH_TIMEOUT_MS
    )
    const responseTimeMs = Date.now() - startedAt
    recordProviderAttempt(provider, 'success', responseTimeMs)
    return {
      ...base,
      available,
      responseTimeMs,
      checkStatus: available ? 'working' : 'unknown error',
      status: base.disabledUntil ? 'warning' : available ? 'working' : 'warning',
      score: base.disabledUntil ? 45 : available ? Math.max(50, 100 - Math.min(50, Math.round(responseTimeMs / 100))) : 35,
      error: base.disabledUntil ? `Temporarily disabled until ${base.disabledUntil}` : available ? undefined : 'Health check returned unavailable',
    }
  } catch (error) {
    const responseTimeMs = Date.now() - startedAt
    recordProviderAttempt(provider, 'failed', responseTimeMs, error)
    const checkStatus = checkStatusFromError(error, client.local === true)
    return {
      ...base,
      available: false,
      responseTimeMs,
      status: statusFromCheckStatus(checkStatus),
      checkStatus,
      score: 10,
      error: sanitizeProviderMessage(error instanceof Error ? error.message : String(error)),
    }
  }
}

export async function getAIHealth(provider?: AIProvider): Promise<AIHealthSummary> {
  logAIEnvironmentDiagnostics()
  const providers = await Promise.all((provider ? [provider] : getProviderPriority()).map(providerHealth))
  const activeProvider = providers.find((provider) => provider.available)?.provider ?? null
  const fallbackProvider = getFallbackProvider(activeProvider)
  const byProvider = Object.fromEntries(providers.map((provider) => [provider.provider, provider.available])) as Record<AIProvider, boolean>

  return {
    gemini: byProvider.gemini ?? false,
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
    checkedAt: new Date().toISOString(),
    configuredProviders: providers.filter((provider) => provider.configured).length,
    workingProviders: providers.filter((provider) => provider.available).length,
  }
}
