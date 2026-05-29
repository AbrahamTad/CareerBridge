/**
 * Swedish Job Sources
 *
 * Generates search URLs for multiple Swedish job boards based on
 * the candidate's CV profile. Used by smart-search to return
 * additional sources beyond Arbetsförmedlingen/JobTech.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobSourceCategory =
  | 'general'
  | 'it'
  | 'healthcare'
  | 'kommunal'
  | 'region'
  | 'education'
  | 'trades'

export interface JobSource {
  name: string
  url: string
  category: JobSourceCategory
  description: string
}

// ─── URL builders ─────────────────────────────────────────────────────────────

function encodeQ(value: string) {
  return encodeURIComponent(value)
}

/** LinkedIn Jobs (Swedish search) */
function linkedIn(role: string, location: string): JobSource {
  const params = new URLSearchParams({ keywords: role, location: location || 'Sverige' })
  return {
    name: 'LinkedIn Jobs',
    url: `https://www.linkedin.com/jobs/search/?${params}`,
    category: 'general',
    description: 'Sök bland tusentals jobb på LinkedIn.',
  }
}

/** Indeed Sverige */
function indeed(role: string, location: string): JobSource {
  const params = new URLSearchParams({ q: role, l: location || 'Sverige' })
  return {
    name: 'Indeed Sverige',
    url: `https://se.indeed.com/jobs?${params}`,
    category: 'general',
    description: 'Indeed — stor jobbsajt med jobb från hela Sverige.',
  }
}

/** JobbSafari — popular Swedish job aggregator */
function jobbSafari(role: string, location: string): JobSource {
  const params = new URLSearchParams({ q: role, ...(location ? { location } : {}) })
  return {
    name: 'JobbSafari',
    url: `https://www.jobbsafari.se/jobb?${params}`,
    category: 'general',
    description: 'JobbSafari samlar jobb från många svenska sajter.',
  }
}

/** Blocket Jobb */
function blocket(role: string): JobSource {
  return {
    name: 'Blocket Jobb',
    url: `https://jobb.blocket.se/?q=${encodeQ(role)}`,
    category: 'general',
    description: 'Blocket Jobb — jobb från hela Sverige.',
  }
}

/** Monster Sverige */
function monster(role: string, location: string): JobSource {
  const path = [role, location].filter(Boolean).map(encodeQ).join('/')
  return {
    name: 'Monster Sverige',
    url: `https://www.monster.se/jobb/sokande/${path}`,
    category: 'general',
    description: 'Monster — internationell jobbsajt med jobb i Sverige.',
  }
}

/** JobbDirekt */
function jobbDirekt(role: string): JobSource {
  return {
    name: 'JobbDirekt',
    url: `https://www.jobbdirekt.se/jobb/?sokt=${encodeQ(role)}`,
    category: 'general',
    description: 'JobbDirekt — snabb sökning bland svenska jobb.',
  }
}

/** Arbetsförmedlingen (Platsbanken) — backup direct link */
function platsbanken(role: string, location: string): JobSource {
  const params = new URLSearchParams({ q: role, ...(location ? { within: '50', municipality: location } : {}) })
  return {
    name: 'Arbetsförmedlingen',
    url: `https://arbetsformedlingen.se/platsbanken/annonser?${params}`,
    category: 'general',
    description: 'Platsbanken — alla anmälda lediga jobb i Sverige.',
  }
}

// ─── Sector-specific sources ──────────────────────────────────────────────────

/** Regionjobb.se — healthcare and administrative jobs within Swedish regions */
function regionjobb(role: string): JobSource {
  return {
    name: 'Regionjobb',
    url: `https://www.regionjobb.se/jobb?q=${encodeQ(role)}`,
    category: 'region',
    description: 'Regionjobb — jobb inom landsting och regioner i Sverige.',
  }
}

/** Kommunal / SKR — municipal sector jobs */
function skrJobb(role: string): JobSource {
  return {
    name: 'SKR Jobb',
    url: `https://jobb.skr.se/?q=${encodeQ(role)}`,
    category: 'kommunal',
    description: 'Jobb inom kommuner och regioner via SKR.',
  }
}

/** Offentliga Jobb — public sector jobs (government, municipalities, regions) */
function offentligaJobb(role: string, location: string): JobSource {
  const params = new URLSearchParams({ q: role, ...(location ? { location } : {}) })
  return {
    name: 'Offentliga Jobb',
    url: `https://offentligajobb.se/jobb?${params}`,
    category: 'kommunal',
    description: 'Jobb inom offentlig sektor — kommuner, regioner, myndigheter.',
  }
}

/** Vårdförbundet Jobb — Swedish nursing/healthcare jobs */
function vardForbundet(role: string): JobSource {
  return {
    name: 'Vårdjobb',
    url: `https://www.vardjobb.se/?query=${encodeQ(role)}`,
    category: 'healthcare',
    description: 'Vårdjobb — specialiserat på vård och omsorg.',
  }
}

/** Saco / Akademikerjobb — academic and specialist roles */
function akademikerjobb(role: string): JobSource {
  return {
    name: 'Akademikerjobb',
    url: `https://www.akademikerjobb.se/jobb?q=${encodeQ(role)}`,
    category: 'it',
    description: 'Akademikerjobb — jobb för högutbildade och specialister.',
  }
}

/** TechCareer.se — Swedish IT and tech jobs */
function techCareer(role: string): JobSource {
  return {
    name: 'TechCareer',
    url: `https://techcareer.se/jobs?q=${encodeQ(role)}`,
    category: 'it',
    description: 'TechCareer — specialiserat på IT och teknikjobb i Sverige.',
  }
}

/** Ledigajobb.se — large Swedish job aggregator */
function ledigaJobb(role: string, location: string): JobSource {
  const params = new URLSearchParams({ q: role, ...(location ? { location } : {}) })
  return {
    name: 'LedigaJobb',
    url: `https://www.ledigajobb.se/?${params}`,
    category: 'general',
    description: 'LedigaJobb — samlar jobb från många arbetsgivare.',
  }
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate a list of job board search URLs based on the candidate's profile.
 *
 * @param roles     Target job roles from CV (e.g. ['Frontend Developer', 'Frontendutvecklare'])
 * @param location  City or region (e.g. 'Göteborg')
 * @param sectors   Detected sectors from CV (e.g. ['it', 'healthcare'])
 * @returns         Array of relevant job sources with direct search URLs
 */
export function generateJobSearchUrls(
  roles: string[],
  location: string,
  sectors: string[] = []
): JobSource[] {
  // Use the most specific role first, fall back to a generic term
  const primaryRole = roles[0] ?? 'jobb'
  const englishRole = roles.find((r) => /^[a-z]/i.test(r)) ?? primaryRole
  const loc = location || 'Sverige'

  const isIT = sectors.includes('it') || roles.some((r) =>
    /frontend|backend|fullstack|developer|engineer|react|java|python|devops|qa|test/i.test(r)
  )
  const isHealthcare = sectors.includes('healthcare') || roles.some((r) =>
    /undersköterska|sjuksköterska|vård|omsorg|stödassistent|vårdbiträde|lss/i.test(r)
  )
  const isEducation = sectors.includes('education') || roles.some((r) =>
    /lärare|pedagog|förskollärare|elevassistent/i.test(r)
  )
  const isPublicSector = isHealthcare || isEducation

  const sources: JobSource[] = [
    // Always include the major general boards
    linkedIn(primaryRole, loc),
    indeed(primaryRole, loc),
    jobbSafari(primaryRole, loc),
    ledigaJobb(primaryRole, loc),
    blocket(primaryRole),
    platsbanken(primaryRole, location),
  ]

  // IT / tech specific
  if (isIT) {
    sources.push(techCareer(englishRole))
    sources.push(akademikerjobb(primaryRole))
  }

  // Healthcare specific
  if (isHealthcare) {
    sources.push(vardForbundet(primaryRole))
    sources.push(regionjobb(primaryRole))
  }

  // Public sector (healthcare, education, municipal services)
  if (isPublicSector) {
    sources.push(skrJobb(primaryRole))
    sources.push(offentligaJobb(primaryRole, location))
  }

  // If no specific sector detected, add general extras
  if (!isIT && !isHealthcare && !isEducation) {
    sources.push(monster(primaryRole, loc))
    sources.push(jobbDirekt(primaryRole))
  }

  return sources
}
