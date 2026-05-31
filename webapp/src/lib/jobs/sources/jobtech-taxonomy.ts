// JobTech Taxonomy API adapter used for diagnostics and future taxonomy enrichment.
import { getOptionalEnv } from '@/lib/server/env'
import type { JobSourceDiagnostic } from '../types'
import { fetchJsonWithRetry, isSourceEnabled } from './source-utils'

const DEFAULT_BASE_URL = 'https://taxonomy.api.jobtechdev.se'

type TaxonomyConcept = {
  id?: string
  preferred_label?: string
  type?: string
}

export function jobTechTaxonomyBaseUrl() {
  return (getOptionalEnv('JOBTECH_TAXONOMY_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

export function isJobTechTaxonomyEnabled() {
  return isSourceEnabled('ENABLE_JOBTECH_TAXONOMY')
}

// Load public occupation names when enabled; local taxonomy remains available as fallback.
export async function fetchJobTechOccupationNames(): Promise<TaxonomyConcept[]> {
  if (!isJobTechTaxonomyEnabled()) return []
  const url = `${jobTechTaxonomyBaseUrl()}/v1/taxonomy/main/concepts?type=occupation-name`
  const data = await fetchJsonWithRetry<unknown>(url)
  if (Array.isArray(data)) return data as TaxonomyConcept[]
  if (data && typeof data === 'object' && Array.isArray((data as { concepts?: unknown[] }).concepts)) {
    return (data as { concepts: TaxonomyConcept[] }).concepts
  }
  return []
}

// Report API availability without making the main matching flow depend on this endpoint.
export async function diagnoseJobTechTaxonomy(): Promise<JobSourceDiagnostic> {
  const enabled = isJobTechTaxonomyEnabled()
  if (!enabled) {
    return { source: 'jobtech-taxonomy', enabled, status: 'disabled', responseTimeMs: 0, details: 'Disabled by ENABLE_JOBTECH_TAXONOMY.' }
  }

  const startedAt = Date.now()
  const url = `${jobTechTaxonomyBaseUrl()}/v1/taxonomy/main/concepts?type=occupation-name`
  try {
    const concepts = await fetchJobTechOccupationNames()
    const count = concepts.length
    return { source: 'jobtech-taxonomy', enabled, status: 'working', responseTimeMs: Date.now() - startedAt, details: `${count} occupation-name concepts available.`, url }
  } catch (error) {
    return { source: 'jobtech-taxonomy', enabled, status: 'failed', responseTimeMs: Date.now() - startedAt, details: error instanceof Error ? error.message : String(error), url }
  }
}
