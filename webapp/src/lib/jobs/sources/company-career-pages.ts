// Curated private employer pages used as supplemental Swedish job-search targets.
import type { JobSource } from '../types'
import { catalogDiagnostic, catalogSource, isSourceEnabled } from './source-utils'

const CARE_EMPLOYER_PAGES = [
  ['attendo', 'Attendo', 'https://attendo.se/jobba-hos-oss/'],
  ['vardaga', 'Vardaga', 'https://vardaga.se/jobba-hos-oss/'],
  ['humana', 'Humana', 'https://www.humana.se/jobba-hos-oss'],
  ['frosunda', 'Frösunda', 'https://frosunda.se/jobba-hos-oss/'],
  ['norlandia', 'Norlandia', 'https://norlandiacare.se/jobba-hos-oss/'],
  ['team-olivia', 'Team Olivia', 'https://teamolivia.se/jobba-hos-oss/'],
  ['nytida', 'Nytida', 'https://nytida.se/jobba-hos-oss/'],
  ['ambea', 'Ambea', 'https://ambea.se/jobba-hos-oss/'],
  ['teamtailor-care', 'Teamtailor care employers', 'https://www.teamtailor.com/'],
] as const

const TECH_EMPLOYER_PAGES = [
  ['academic-work', 'Academic Work', 'https://www.academicwork.se/lediga-jobb'],
  ['afry', 'AFRY', 'https://afry.com/sv/bli-en-del-av-afry'],
  ['cgi', 'CGI', 'https://www.cgi.com/se/sv/karriar'],
  ['hiq', 'HiQ', 'https://hiq.se/karriar/'],
  ['knowit', 'Knowit', 'https://www.knowit.se/karriar/'],
  ['nexer', 'Nexer', 'https://nexergroup.com/sv/career/'],
  ['sigma', 'Sigma', 'https://www.sigma.se/jobba-hos-oss/'],
] as const

export function isCompanyCareerPagesEnabled() {
  return isSourceEnabled('ENABLE_COMPANY_CAREER_PAGES')
}

// Choose care employers for care profiles and tech-focused pages for other sectors.
export function companyCareerPageSources(term: string, location = '', sectors: string[] = []): JobSource[] {
  const enabled = isCompanyCareerPagesEnabled()
  const searchCare = sectors.some((sector) => /healthcare|care|vård|omsorg|lss/i.test(sector))
  const pages = searchCare ? CARE_EMPLOYER_PAGES : TECH_EMPLOYER_PAGES
  return pages.map(([id, name, homePageUrl]) => catalogSource({
    id: `company-${id}`,
    name,
    kind: 'company-career-page',
    category: 'company',
    description: `Privat arbetsgivarsida för ${name}.`,
    homePageUrl,
    term,
    location,
    enabled,
  }))
}

export function diagnoseCompanyCareerPages() {
  return catalogDiagnostic('company-career-pages', isCompanyCareerPagesEnabled(), CARE_EMPLOYER_PAGES.length + TECH_EMPLOYER_PAGES.length, 'private care, tech recruiter, and company career-page targets configured.')
}
