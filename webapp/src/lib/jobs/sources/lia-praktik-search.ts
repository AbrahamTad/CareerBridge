import type { JobSource } from '../types'
import { catalogDiagnostic, catalogSource, isSourceEnabled } from './source-utils'

const LIA_PRAKTIK_PAGES = [
  ['arbetsformedlingen-lia', 'Platsbanken LIA/praktik', 'https://arbetsformedlingen.se/platsbanken/'],
  ['offentliga-jobb-lia', 'Offentliga Jobb praktik', 'https://www.offentligajobb.se/'],
  ['linkedin-internships', 'LinkedIn internships', 'https://www.linkedin.com/jobs/'],
  ['indeed-praktik', 'Indeed praktik', 'https://se.indeed.com/'],
  ['teamtailor-trainee', 'Teamtailor trainee pages', 'https://www.teamtailor.com/'],
] as const

export function isLiaPraktikSearchEnabled() {
  return isSourceEnabled('ENABLE_LIA_PRAKTIK_SEARCH')
}

export function liaPraktikSources(term: string, location = ''): JobSource[] {
  const enabled = isLiaPraktikSearchEnabled()
  const opportunityTerm = `${term} LIA praktik internship trainee`
  return LIA_PRAKTIK_PAGES.map(([id, name, homePageUrl]) => catalogSource({
    id,
    name,
    kind: 'lia-praktik',
    category: 'lia-praktik',
    description: `${name}: sökning efter LIA, praktik, internship och traineeplatser.`,
    homePageUrl,
    term: opportunityTerm,
    location,
    enabled,
  }))
}

export function diagnoseLiaPraktikSearch() {
  return catalogDiagnostic('lia-praktik-search', isLiaPraktikSearchEnabled(), LIA_PRAKTIK_PAGES.length, 'LIA, praktik, internship, and trainee search targets configured.')
}
