import type { JobListing, JobSource, JobSourceDiagnostic } from '../types'
import { uniqueExternalJobs } from '../jobtech'
import { hasCareProfile } from '../profession-taxonomy'
import {
  arbetsformedlingenSearchPage,
  diagnoseArbetsformedlingen,
  isArbetsformedlingenEnabled,
  searchArbetsformedlingen,
} from './arbetsformedlingen'
import { companyCareerPageSources, diagnoseCompanyCareerPages } from './company-career-pages'
import { diagnoseJobTechTaxonomy } from './jobtech-taxonomy'
import { diagnoseKommunJobs, kommunJobSources } from './kommun-jobs'
import { diagnoseLiaPraktikSearch, liaPraktikSources } from './lia-praktik-search'
import { diagnoseRegionJobs, regionJobSources } from './region-jobs'
import { catalogSource } from './source-utils'

export interface SwedishJobSearchResult {
  jobs: JobListing[]
  sourceLinks: JobSource[]
  diagnostics: JobSourceDiagnostic[]
  searchesRun: number
}

function offentligaJobbSource(term: string, location = ''): JobSource {
  return catalogSource({
    id: 'offentliga-jobb',
    name: 'Offentliga Jobb',
    kind: 'offentliga-jobb',
    category: 'kommunal',
    description: 'Offentlig sektor: kommuner, regioner och myndigheter.',
    homePageUrl: 'https://www.offentligajobb.se/',
    term,
    location,
    enabled: true,
  })
}

export function swedishJobSourceLinks(
  terms: string[],
  location = '',
  sectors: string[] = [],
  liaOnly = false
): JobSource[] {
  const term = terms.find(Boolean) ?? 'jobb'
  const profileText = `${terms.join(' ')} ${sectors.join(' ')}`
  const careProfile = hasCareProfile(profileText)
  const normalizedSectors = careProfile ? [...sectors, 'healthcare'] : sectors
  const sources: JobSource[] = [
    arbetsformedlingenSearchPage(term, location),
    offentligaJobbSource(term, location),
    ...kommunJobSources(term, location),
    ...regionJobSources(term, location),
    ...companyCareerPageSources(term, location, normalizedSectors),
  ]
  if (liaOnly || /\b(lia|praktik|internship|trainee)\b/i.test(profileText)) {
    sources.push(...liaPraktikSources(term, location))
  }
  return sources.filter((source) => source.enabled)
}

export async function aggregateSwedishJobs(
  terms: string[],
  locations: string[],
  limit = 25,
  sectors: string[] = [],
  liaOnly = false
): Promise<SwedishJobSearchResult> {
  const searches = terms.filter(Boolean).flatMap((term) =>
    (locations.length ? locations : ['']).map((location) => ({ term, location }))
  )
  const startedAt = Date.now()
  const settled = await Promise.allSettled(
    searches.map(({ term, location }) => searchArbetsformedlingen(term, location, limit))
  )
  const jobs = uniqueExternalJobs(settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
  const failures = settled.filter((result) => result.status === 'rejected')
  const enabled = isArbetsformedlingenEnabled()
  const diagnostics: JobSourceDiagnostic[] = [{
    source: 'arbetsformedlingen',
    enabled,
    status: !enabled ? 'disabled' : failures.length === settled.length && settled.length > 0 ? 'failed' : 'working',
    responseTimeMs: Date.now() - startedAt,
    details: !enabled
      ? 'Disabled by ENABLE_ARBETSFORMEDLINGEN.'
      : `${settled.length - failures.length}/${settled.length} JobTech searches completed; ${jobs.length} unique jobs found.`,
  }]

  if (failures.length) {
    console.warn('[Jobs] Arbetsförmedlingen partial failure', {
      completed: settled.length - failures.length,
      failed: failures.length,
    })
  } else {
    console.info('[Jobs] Arbetsförmedlingen search completed', {
      searches: settled.length,
      jobs: jobs.length,
    })
  }

  return {
    jobs,
    sourceLinks: swedishJobSourceLinks(terms, locations.find(Boolean) ?? '', sectors, liaOnly),
    diagnostics,
    searchesRun: searches.length,
  }
}

export async function diagnoseSwedishJobSources() {
  return Promise.all([
    diagnoseArbetsformedlingen(),
    diagnoseJobTechTaxonomy(),
    Promise.resolve(diagnoseKommunJobs()),
    Promise.resolve(diagnoseRegionJobs()),
    Promise.resolve(diagnoseCompanyCareerPages()),
    Promise.resolve(diagnoseLiaPraktikSearch()),
  ])
}
