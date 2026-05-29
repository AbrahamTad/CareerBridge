'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react'
import type { AIHealthSummary, ProviderHealth } from '@/lib/ai/types'

const PROVIDER_LABELS: Record<string, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  groq: 'Groq',
  openrouter: 'OpenRouter',
  aisweden: 'AI Sweden',
  huggingface: 'Hugging Face',
  ollama: 'Ollama',
  anthropic: 'Anthropic',
}

function statusClasses(status: ProviderHealth['status']) {
  if (status === 'working') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-rose-200 bg-rose-50 text-rose-800'
}

function StatusIcon({ status }: { status: ProviderHealth['status'] }) {
  if (status === 'working') return <CheckCircle2 className="h-4 w-4" />
  if (status === 'warning') return <AlertTriangle className="h-4 w-4" />
  return <XCircle className="h-4 w-4" />
}

function statusText(provider: ProviderHealth) {
  const labels: Record<ProviderHealth['checkStatus'], string> = {
    working: 'Working',
    'missing key': 'Missing key',
    'invalid key': 'Invalid key',
    'quota exceeded': 'Quota exceeded',
    timeout: 'Timeout',
    'server offline': 'Server offline',
    skipped: 'Skipped',
    'unknown error': 'Failed',
  }

  return labels[provider.checkStatus] ?? provider.status
}

function formatDate(value?: string) {
  if (!value) return 'Ingen historik'
  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AIProvidersSettingsPage() {
  const [health, setHealth] = useState<AIHealthSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mergeProviderHealth = useCallback((current: AIHealthSummary, incoming: AIHealthSummary): AIHealthSummary => {
    const incomingProvider = incoming.providers[0]
    if (!incomingProvider) return current

    const providers = current.providers.map((provider) =>
      provider.provider === incomingProvider.provider ? incomingProvider : provider
    )
    const activeProvider = providers.find((provider) => provider.available)?.provider ?? null

    return {
      ...current,
      [incomingProvider.provider === 'aisweden' ? 'aiSweden' : incomingProvider.provider]: incomingProvider.available,
      activeProvider,
      fallbackProvider: incoming.fallbackProvider,
      providers,
      checkedAt: incoming.checkedAt,
      configuredProviders: providers.filter((provider) => provider.configured).length,
      workingProviders: providers.filter((provider) => provider.available).length,
    }
  }, [])

  const loadHealth = useCallback(async (provider?: string) => {
    if (provider) setLoadingProvider(provider)
    else setLoading(true)
    setError(null)
    try {
      const response = await fetch(provider ? `/api/ai/health?provider=${provider}` : '/api/ai/health', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte läsa AI-status')
      setHealth((current) => provider && current ? mergeProviderHealth(current, data) : data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte läsa AI-status')
    } finally {
      if (provider) setLoadingProvider(null)
      else setLoading(false)
    }
  }, [mergeProviderHealth])

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  const providers = health?.providers ?? []
  const hasWorkingProvider = (health?.workingProviders ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI-leverantörer</h1>
          <p className="mt-1 text-sm text-slate-500">
            Övervaka fallback-kedjan för CV-generering, matchning och AI-sökning.
          </p>
        </div>
        <button
          onClick={() => void loadHealth()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Uppdatera
        </button>
      </div>

      <div className={`rounded-lg border p-4 ${hasWorkingProvider ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-start gap-3">
          <Activity className={`mt-0.5 h-5 w-5 ${hasWorkingProvider ? 'text-emerald-700' : 'text-amber-700'}`} />
          <div>
            <p className={`font-semibold ${hasWorkingProvider ? 'text-emerald-950' : 'text-amber-950'}`}>
              {hasWorkingProvider ? 'AI-fallback är aktiv' : 'Ingen AI-leverantör svarar just nu'}
            </p>
            <p className={`mt-1 text-sm ${hasWorkingProvider ? 'text-emerald-800' : 'text-amber-800'}`}>
              {hasWorkingProvider
                ? `${health?.workingProviders ?? 0} av ${health?.configuredProviders ?? 0} konfigurerade leverantörer svarar.`
                : 'Appen fortsätter fungera i degraderat läge och kan skapa enkla lokala CV-utkast.'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {providers.map((provider) => (
          <div key={provider.provider} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">{PROVIDER_LABELS[provider.provider] ?? provider.provider}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {provider.local ? 'Lokal leverantör' : 'Extern API-leverantör'}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(provider.status)}`}>
                <StatusIcon status={provider.status} />
                {statusText(provider)}
              </span>
            </div>

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Konfiguration</dt>
                <dd className="mt-1 font-medium text-slate-700">{provider.configured ? 'Konfigurerad' : 'Saknas'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Model</dt>
                <dd className="mt-1 break-words font-medium text-slate-700">{provider.model || 'Default'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Last checked</dt>
                <dd className="mt-1 font-medium text-slate-700">{formatDate(provider.checkedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Svarstid</dt>
                <dd className="mt-1 font-medium text-slate-700">{provider.responseTimeMs} ms</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Senast lyckad</dt>
                <dd className="mt-1 font-medium text-slate-700">{formatDate(provider.lastSuccessAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-400">Poäng</dt>
                <dd className="mt-1 font-medium text-slate-700">{provider.score}/100</dd>
              </div>
            </dl>

            <button
              onClick={() => void loadHealth(provider.provider)}
              disabled={loadingProvider === provider.provider}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingProvider === provider.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              Retry test
            </button>

            {(provider.error || provider.lastError || provider.disabledUntil) && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                {provider.error && <p>{provider.error}</p>}
                {provider.lastError && <p className="mt-1">Senaste fel: {provider.lastError}</p>}
                {provider.lastHttpStatus && <p className="mt-1">HTTP-status: {provider.lastHttpStatus}</p>}
                {provider.disabledUntil && <p className="mt-1">Tillfälligt pausad till {formatDate(provider.disabledUntil)}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
        <p>
          Lägg till fler API-nycklar i <code className="rounded bg-slate-100 px-1 py-0.5">webapp/.env.local</code> för bättre redundans.
          Se <Link href="/settings" className="font-semibold text-blue-700 hover:underline">inställningar</Link> och projektets AI-guide.
        </p>
      </div>
    </div>
  )
}
