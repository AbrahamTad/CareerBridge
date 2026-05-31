import { getBooleanEnv, getOptionalEnv } from '@/lib/server/env'
import type { JobSource, JobSourceCategory, JobSourceDiagnostic, JobSourceKind } from '../types'

export function isSourceEnabled(envKey: string, defaultValue = true) {
  return getBooleanEnv(envKey, defaultValue)
}

export function jobSourceTimeoutMs() {
  return Number(getOptionalEnv('JOB_SOURCE_TIMEOUT_MS')) || 10_000
}

function jobSourceRetryCount() {
  const configured = getOptionalEnv('JOB_SOURCE_RETRY_COUNT')
  return configured === undefined ? 1 : Math.max(0, Math.min(3, Number(configured) || 0))
}

export async function fetchJsonWithRetry<T>(url: string, init: RequestInit = {}): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= jobSourceRetryCount(); attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { accept: 'application/json', ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(jobSourceTimeoutMs()),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json() as T
    } catch (error) {
      lastError = error
      if (attempt < jobSourceRetryCount()) continue
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Job source request failed')
}

export function sourceSearchUrl(homePageUrl: string, term: string, location = '') {
  const host = new URL(homePageUrl).hostname
  const query = [`site:${host}`, term, location].filter(Boolean).join(' ')
  return `https://www.google.com/search?${new URLSearchParams({ q: query })}`
}

export function catalogSource(input: {
  id: string
  name: string
  kind: JobSourceKind
  category: JobSourceCategory
  description: string
  homePageUrl: string
  term: string
  location?: string
  enabled: boolean
}): JobSource {
  return {
    ...input,
    url: sourceSearchUrl(input.homePageUrl, input.term, input.location),
  }
}

export function catalogDiagnostic(source: string, enabled: boolean, count: number, details: string): JobSourceDiagnostic {
  return {
    source,
    enabled,
    status: enabled ? 'configured' : 'disabled',
    responseTimeMs: 0,
    details: enabled ? `${count} ${details}` : 'Disabled by environment configuration.',
  }
}
