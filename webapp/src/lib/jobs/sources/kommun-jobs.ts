// Curated municipality career pages for Swedish public-sector job discovery.
import type { JobSource } from '../types'
import { catalogDiagnostic, catalogSource, isSourceEnabled } from './source-utils'

const KOMMUN_CAREER_PAGES = [
  ['goteborgs-stad', 'Göteborgs Stad', 'https://goteborg.se/wps/portal/start/jobba-hos-oss'],
  ['stockholms-stad', 'Stockholms stad', 'https://jobba.stockholm/'],
  ['malmo-stad', 'Malmö stad', 'https://malmo.se/Jobb.html'],
  ['uppsala-kommun', 'Uppsala kommun', 'https://www.uppsala.se/jobb/'],
  ['orebro-kommun', 'Örebro kommun', 'https://www.orebro.se/jobb'],
  ['vasteras-stad', 'Västerås stad', 'https://www.vasteras.se/naringsliv-och-arbete/jobba-hos-oss.html'],
  ['linkopings-kommun', 'Linköpings kommun', 'https://www.linkoping.se/naringsliv-och-arbete/jobba-hos-oss/'],
  ['helsingborgs-stad', 'Helsingborgs stad', 'https://helsingborg.se/arbete/lediga-jobb/'],
  ['lund-kommun', 'Lunds kommun', 'https://lund.se/arbete-och-lediga-jobb'],
  ['boras-stad', 'Borås Stad', 'https://www.boras.se/arbete'],
] as const

export function isKommunJobsEnabled() {
  return isSourceEnabled('ENABLE_KOMMUN_JOBS')
}

// Build outbound searches because municipality career sites use different platforms.
export function kommunJobSources(term: string, location = ''): JobSource[] {
  const enabled = isKommunJobsEnabled()
  return KOMMUN_CAREER_PAGES.map(([id, name, homePageUrl]) => catalogSource({
    id: `kommun-${id}`,
    name,
    kind: 'kommun',
    category: 'kommunal',
    description: `Kommunala jobb hos ${name}, inklusive vård, omsorg, skola och administration.`,
    homePageUrl,
    term,
    location,
    enabled,
  }))
}

export function diagnoseKommunJobs() {
  return catalogDiagnostic('kommun-jobs', isKommunJobsEnabled(), KOMMUN_CAREER_PAGES.length, 'municipality career pages configured.')
}
