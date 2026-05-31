import type { JobSource } from '../types'
import { catalogDiagnostic, catalogSource, isSourceEnabled } from './source-utils'

const REGION_CAREER_PAGES = [
  ['vastra-gotaland', 'Region Västra Götaland', 'https://www.vgregion.se/jobba-i-vgr/'],
  ['stockholm', 'Region Stockholm', 'https://www.regionstockholm.se/jobb/'],
  ['skane', 'Region Skåne', 'https://www.skane.se/jobba-hos-oss/'],
  ['halland', 'Region Halland', 'https://www.regionhalland.se/jobb-och-karriar'],
  ['ostergotland', 'Region Östergötland', 'https://www.regionostergotland.se/ro/jobb-och-karriar'],
] as const

export function isRegionJobsEnabled() {
  return isSourceEnabled('ENABLE_REGION_JOBS')
}

export function regionJobSources(term: string, location = ''): JobSource[] {
  const enabled = isRegionJobsEnabled()
  return REGION_CAREER_PAGES.map(([id, name, homePageUrl]) => catalogSource({
    id: `region-${id}`,
    name,
    kind: 'region',
    category: 'region',
    description: `Regionjobb hos ${name}, inklusive vård, hälsa, service och administration.`,
    homePageUrl,
    term,
    location,
    enabled,
  }))
}

export function diagnoseRegionJobs() {
  return catalogDiagnostic('region-jobs', isRegionJobsEnabled(), REGION_CAREER_PAGES.length, 'region career pages configured.')
}
