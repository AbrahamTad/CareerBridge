import { getOptionalEnv } from '@/lib/server/env'
import { searchJobTech } from '../jobtech'
import type { JobSource, JobSourceDiagnostic } from '../types'
import { fetchJsonWithRetry, isSourceEnabled } from './source-utils'

const DEFAULT_BASE_URL = 'https://jobsearch.api.jobtechdev.se'

export function arbetsformedlingenBaseUrl() {
  return (getOptionalEnv('ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function isArbetsformedlingenEnabled() {
  return isSourceEnabled('ENABLE_ARBETSFORMEDLINGEN')
}

export function arbetsformedlingenSearchPage(term: string, location = ''): JobSource {
  const params = new URLSearchParams({ q: [term, location].filter(Boolean).join(' ') })
  return {
    id: 'arbetsformedlingen-platsbanken',
    name: 'Arbetsförmedlingen / Platsbanken',
    kind: 'arbetsformedlingen',
    category: 'general',
    description: 'Aktiva svenska jobb via Arbetsförmedlingen och JobTech JobSearch API.',
    url: `https://arbetsformedlingen.se/platsbanken/annonser?${params}`,
    homePageUrl: 'https://arbetsformedlingen.se/platsbanken',
    enabled: isArbetsformedlingenEnabled(),
  }
}

export async function searchArbetsformedlingen(term: string, location = '', limit = 25) {
  if (!isArbetsformedlingenEnabled()) return []
  return searchJobTech(term, location, limit)
}

export async function diagnoseArbetsformedlingen(): Promise<JobSourceDiagnostic> {
  const enabled = isArbetsformedlingenEnabled()
  if (!enabled) {
    return { source: 'arbetsformedlingen', enabled, status: 'disabled', responseTimeMs: 0, details: 'Disabled by ENABLE_ARBETSFORMEDLINGEN.' }
  }

  const startedAt = Date.now()
  const url = `${arbetsformedlingenBaseUrl()}/search?${new URLSearchParams({ q: 'undersköterska', limit: '1' })}`
  try {
    await fetchJsonWithRetry(url)
    return { source: 'arbetsformedlingen', enabled, status: 'working', responseTimeMs: Date.now() - startedAt, details: 'JobSearch API responded.', url }
  } catch (error) {
    return { source: 'arbetsformedlingen', enabled, status: 'failed', responseTimeMs: Date.now() - startedAt, details: error instanceof Error ? error.message : String(error), url }
  }
}
