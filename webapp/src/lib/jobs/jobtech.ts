// JobTech JobSearch API adapter that normalizes Arbetsformedlingen postings for CareerBridge.
import { getOptionalEnv } from '@/lib/server/env'
import { fetchJsonWithRetry, isSourceEnabled } from './sources/source-utils'
import type { JobListing } from './types'

export type ExternalJob = JobListing

interface JobTechHit {
  id: string
  webpage_url?: string | null
  logo_url?: string | null
  headline?: string | null
  description?: { text?: string | null }
  employer?: { name?: string | null; workplace?: string | null }
  application_details?: { url?: string | null }
  workplace_address?: {
    municipality?: string | null
    city?: string | null
    region?: string | null
    country?: string | null
  }
  employment_type?: { label?: string | null }
  working_hours_type?: { label?: string | null }
  salary_description?: string | null
  publication_date?: string | null
  application_deadline?: string | null
  last_publication_date?: string | null
  removed?: boolean
}

interface JobTechResponse {
  hits?: JobTechHit[]
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()))
}

function buildQuery(term: string, location?: string): string {
  const normalizedLocation = location?.trim().toLowerCase()
  // Omitting a whole-country label lets JobTech search all of Sweden.
  const area = normalizedLocation === 'sverige' || normalizedLocation === 'sweden' ? '' : location
  return compact([term, area]).join(' ')
}

// Fetch active JobTech ads. Timeout and retry handling live in the shared source utility.
export async function searchJobTech(term: string, location = '', limit = 25): Promise<ExternalJob[]> {
  if (!isSourceEnabled('ENABLE_ARBETSFORMEDLINGEN')) return []
  const q = buildQuery(term, location)
  if (!q) return []

  const params = new URLSearchParams({
    q,
    limit: String(limit),
    offset: '0',
  })

  const baseUrl = (getOptionalEnv('ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL') ?? 'https://jobsearch.api.jobtechdev.se').replace(/\/+$/, '')
  const data = await fetchJsonWithRetry<JobTechResponse>(`${baseUrl}/search?${params}`)
  const jobs = data.hits ?? []

  return jobs
    .filter((job) => job.id && !job.removed)
    .map((job) => {
      const address = job.workplace_address
      const companyName = job.employer?.name ?? job.employer?.workplace ?? 'Okänd arbetsgivare'
      const description = job.description?.text ?? job.headline ?? ''
      const searchableText = `${job.headline ?? ''} ${description} ${job.employment_type?.label ?? ''}`
      const locationText = compact([address?.city, address?.municipality, address?.region])
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(', ')

      return {
        externalId: job.id,
        sourceAts: 'jobtech',
        title: job.headline ?? 'Namnlös tjänst',
        description,
        companyName,
        companyLogoUrl: job.logo_url,
        sourceUrl: job.application_details?.url ?? job.webpage_url,
        location: locationText || address?.country || 'Sverige',
        city: address?.city ?? address?.municipality ?? null,
        country: address?.country ?? 'Sverige',
        jobType: compact([job.employment_type?.label, job.working_hours_type?.label]).join(' · ') || null,
        salary: job.salary_description,
        isRemote: description.toLowerCase().includes('distans'),
        isHybrid: description.toLowerCase().includes('hybrid'),
        isLia: /\b(lia|praktik|praktikplats|praktikant|internship|intern|trainee|traineeprogram|apprentice|apprenticeship|lärling|lärlingsplats|larling|apl|examensarbete)\b/i.test(searchableText),
        postedAt: parseDate(job.publication_date),
        closingAt: parseDate(job.application_deadline ?? job.last_publication_date),
      }
    })
}

// The same posting can appear in several searches, so deduplicate before persistence.
export function uniqueExternalJobs(jobs: ExternalJob[]): ExternalJob[] {
  const seen = new Set<string>()
  const unique: ExternalJob[] = []

  for (const job of jobs) {
    const key = `${job.sourceAts}:${job.externalId}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(job)
  }

  return unique
}
