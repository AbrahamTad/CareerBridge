import type { Prisma } from '@prisma/client'

type MatchTier = 'strong' | 'medium' | 'weak'

type MatchableJob = Prisma.JobListingGetPayload<{ include: { company: true } }>

export interface StructuredCvProfile {
  jobTitles: string[]
  skills: string[]
  education: string[]
  experienceYears: number
  languages: string[]
  location: string[]
  preferredRoles: string[]
  industries: string[]
  seniorityLevel: 'student' | 'junior' | 'mid' | 'senior'
  liaNeed: boolean
  categories: string[]
  licenses: string[]
}

export interface StructuredJobProfile {
  title: string
  requiredSkills: string[]
  niceToHaveSkills: string[]
  educationRequirements: string[]
  experienceYears: number
  location: string[]
  languages: string[]
  seniority: 'student' | 'junior' | 'mid' | 'senior'
  jobType: string[]
  industry: string
  categories: string[]
  requiredLicenses: string[]
}

export interface RelevanceScore {
  matchScore: number
  score: number
  tier: MatchTier
  isRecommended: boolean
  matchedSkills: string[]
  missingSkills: string[]
  reason: string
  improvementTips: string[]
  hardRejectReasons: string[]
  cvProfile: StructuredCvProfile
  jobProfile: StructuredJobProfile
  scoreBreakdown: {
    skills: number
    experience: number
    education: number
    role: number
    locationLanguage: number
    careerGoal: number
  }
}

const SKILLS = [
  'frontend', 'frontendutvecklare', 'webbutvecklare', 'ui developer',
  'javascript', 'typescript', 'react', 'next.js', 'node.js', 'html', 'css', 'tailwind',
  'vue', 'angular', 'python', 'java', 'c#', 'sql', 'postgresql', 'prisma', 'supabase',
  'git', 'github', 'docker', 'azure', 'aws', 'figma', 'jira', 'scrum', 'agile',
  'cypress', 'playwright', 'jest', 'selenium', 'postman', 'qa', 'testing',
  'excel', 'power bi', 'customer service', 'support', 'it support',
  'underskoterska', 'vardbitrade', 'stodassistent', 'aldreomsorg', 'funktionsstod',
  'bmss', 'omvardnad', 'hemtjanst', 'lss', 'journaldokumentation', 'medicinering',
  'pedagogik', 'truckkort', 'lager', 'restaurang', 'stadning',
]

const IT_TERMS = [
  'frontend', 'front-end', 'web developer', 'webbutvecklare', 'webbprogrammerare',
  'webb- och applikationsutvecklare', 'webb och app',
  'utvecklare', 'developer', 'engineer',
  'react', 'javascript', 'typescript', 'python', 'java',
  'qa', 'testare', 'it support', 'supporttekniker',
  'programmer', 'software', 'fullstack', 'backend', 'systemutvecklare',
  'mjukvaruutvecklare', 'applikationsutvecklare',
  'devops', 'cloud', 'platform', 'ux', 'ui designer',
]

const HEALTHCARE_TERMS = [
  'sjukskoterska', 'underskoterska', 'vard', 'omsorg', 'hemtjanst', 'lss',
  'personlig assistent', 'boendestod', 'vardbitrade', 'stodassistent',
  'aldreomsorg', 'funktionsstod', 'bmss', 'lakare', 'nurse',
  'omsorgsassistent', 'vardpersonal', 'boende', 'gruppboende', 'serviceboende',
  'daglig verksamhet', 'korttidsboende', 'socialpedagog', 'behandlingsassistent',
  'omvardnad', 'medicinsk',
]

const LOGISTICS_TERMS = ['truckforare', 'chauffor', 'lager', 'warehouse', 'driver', 'transport']
const CLEANING_TERMS = ['stadare', 'stadning', 'cleaner', 'lokalvardare']
const RESTAURANT_TERMS = ['restaurang', 'kock', 'servitor', 'barista', 'restaurant']
const EDUCATION_TERMS = ['larare', 'forskola', 'elevassistent', 'pedagog', 'teacher']
const LICENSE_TERMS = ['legitimation', 'sjukskoterskelegitimation', 'korkort', 'truckkort', 'yrkesbevis']

const SYNONYM_GROUPS = [
  // Frontend / Web development
  [
    'frontendutvecklare', 'frontend developer', 'frontend', 'front-end',
    'webbutvecklare', 'webbprogrammerare', 'webb- och applikationsutvecklare',
    'react developer', 'javascript developer', 'typescript developer',
    'ui developer', 'ui-utvecklare', 'webb och app', 'webbdesigner',
  ],
  // Backend / Systems
  [
    'backendutvecklare', 'backend developer', 'backend',
    'systemutvecklare', 'system developer', 'systems developer',
    'mjukvaruutvecklare', 'software developer', 'software engineer',
    'applikationsutvecklare', 'programmerare', 'programmer', 'utvecklare',
  ],
  // Full stack
  [
    'fullstackutvecklare', 'fullstack developer', 'full stack', 'fullstack', 'full-stack',
    'webb- och systemutvecklare',
  ],
  // QA / Test
  [
    'qa', 'qa engineer', 'quality assurance', 'testare', 'mjukvarutestare',
    'test automation', 'testingenjor', 'testspecialist', 'qa-testare',
    'systemtestare', 'acceptanstestare', 'verifieringsingenjor',
  ],
  // IT support / Servicedesk
  [
    'it support', 'it-support', 'servicedesk', 'service desk', 'helpdesk',
    'supporttekniker', 'it-tekniker', 'drifttekniker', 'it-drifttekniker',
    'teknisk support', 'first line support', 'second line support',
  ],
  // Undersköterska / Vård
  [
    'underskoterska', 'undersköterska', 'vardbitrade', 'vardbirade',
    'aldreomsorg', 'aldreomsorgsassistent', 'omsorgsassistent',
    'omvardnad', 'hemtjanst', 'hemtjanstpersonal',
    'vardpersonal', 'vard och omsorg', 'vard- och omsorgspersonal',
    'medicinsk personal', 'akutvard',
  ],
  // LSS / Funktionsstöd / Stödassistent
  [
    'stodassistent', 'stödassistent', 'lss', 'lss-assistent',
    'funktionsstod', 'funktionsstöd', 'funktionsstödsassistent',
    'boendestod', 'boendestödjare', 'boendestöd',
    'bmss', 'personlig assistent', 'avlosare', 'ledsagare',
    'omsorgsassistent lss', 'daglig verksamhet', 'gruppboende',
    'serviceboende', 'korttidsboende', 'socialpedagog',
  ],
  // Sjuksköterska
  [
    'sjukskoterska', 'sjuksköterska', 'nurse', 'registered nurse',
    'legitimerad sjukskoterska', 'distriktsskoterska', 'operationsskoterska',
  ],
  // Socionom / Social work
  [
    'socionom', 'socialsekreterare', 'biståndshandlaggere', 'biståndshandläggare',
    'kurator', 'socialt arbete', 'familjeterapeut', 'behandlingsassistent',
  ],
  // Teacher / Education
  [
    'larare', 'lärare', 'grundskollärare', 'gymnasielärare', 'ämneslärare',
    'yrkeslärare', 'sfi-larare', 'modersmålslärare', 'speciallarare',
    'specialpedagog', 'pedagog',
  ],
  // Förskollärare / Barnskötare
  [
    'forskollarare', 'förskollärare', 'forskolataren', 'barnskotare', 'barnskötare',
    'forskola', 'fritidspedagog',
  ],
  // LIA / Internship
  [
    'lia', 'lärande i arbete', 'larande i arbete',
    'praktik', 'praktikplats', 'praktikant',
    'internship', 'intern', 'trainee', 'larling',
    'yh-student', 'yrkeshogskola',
  ],
  // DevOps / Cloud / Platform
  [
    'devops', 'devops engineer', 'cloud engineer', 'platform engineer',
    'site reliability', 'sre', 'infrastrukturingenjor', 'molningenjor',
    'driftsansvarig', 'driftsingenjor',
  ],
  // UX / Design
  [
    'ux', 'ux designer', 'ux-designer', 'ui designer', 'ui-designer',
    'interaktionsdesigner', 'product designer', 'produktdesigner',
    'ux/ui', 'user experience', 'usability',
  ],
]

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
}


// Pre-normalized once at module load — avoids re-normalizing 200+ static strings on every overlap() call.
const NORMALIZED_SYNONYM_GROUPS = SYNONYM_GROUPS.map((group) => group.map(normalize))

function unique(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = normalize(value.trim())
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function includesAny(text: string, terms: string[]) {
  const normalized = normalize(text)
  return terms.some((term) => normalized.includes(normalize(term)))
}

function findTerms(text: string, terms: string[]) {
  const normalized = normalize(text)
  return terms.filter((term) => normalized.includes(normalize(term)))
}

function stringsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function dataRecord(parsedData: Prisma.JsonValue | null): Record<string, unknown> {
  return parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)
    ? parsedData as Record<string, unknown>
    : {}
}

function extractYears(text: string) {
  const matches = Array.from(normalize(text).matchAll(/(\d+)\s*(?:\+?\s*)?(?:ar|year|years)/g))
  const years = matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value))
  return years.length ? Math.max(...years) : 0
}

function categoriesFromText(text: string) {
  const categories: string[] = []
  if (includesAny(text, IT_TERMS)) categories.push('it')
  if (includesAny(text, HEALTHCARE_TERMS)) categories.push('healthcare')
  if (includesAny(text, LOGISTICS_TERMS)) categories.push('logistics')
  if (includesAny(text, CLEANING_TERMS)) categories.push('cleaning')
  if (includesAny(text, RESTAURANT_TERMS)) categories.push('restaurant')
  if (includesAny(text, EDUCATION_TERMS)) categories.push('education')
  return unique(categories)
}

function seniorityFromText(text: string, fallback: StructuredCvProfile['seniorityLevel'] = 'mid') {
  const normalized = normalize(text)
  if (/\b(student|studerande|lia|praktik|intern)\b/.test(normalized)) return 'student'
  if (/\b(junior|trainee|entry level)\b/.test(normalized)) return 'junior'
  if (/\b(senior|lead|principal|arkitekt|manager)\b/.test(normalized) || extractYears(text) >= 5) return 'senior'
  return fallback
}

function overlap(a: string[], b: string[]) {
  const bSet = new Set(b.map(normalize))
  return unique(a).filter((item) => {
    const normItem = normalize(item)
    if (bSet.has(normItem)) return true
    return NORMALIZED_SYNONYM_GROUPS.some((group) =>
      group.includes(normItem) && group.some((synonym) => bSet.has(synonym))
    )
  })
}

function ratio(matched: number, total: number) {
  if (total <= 0) return 0.7
  return Math.min(1, matched / total)
}

function scoreToTier(score: number): MatchTier {
  if (score >= 75) return 'strong'
  if (score >= 55) return 'medium'
  return 'weak'
}

export function parseCvProfile(rawText: string, parsedData: Prisma.JsonValue | null): StructuredCvProfile {
  const data = dataRecord(parsedData)
  const text = `${rawText} ${JSON.stringify(data)}`
  const preferredRoles = unique([
    ...stringsFrom(data.targetRoles),
    ...stringsFrom(data.jobTitles),
  ])
  const skills = unique([
    ...stringsFrom(data.skills),
    ...stringsFrom(data.tools),
    ...stringsFrom(data.toolsAndTech),
    ...stringsFrom(data.languages),
    ...findTerms(text, SKILLS),
  ])
  const categories = unique([
    ...stringsFrom(data.sectors),
    ...stringsFrom(data.industries),
    ...categoriesFromText(`${preferredRoles.join(' ')} ${skills.join(' ')} ${text}`),
  ])
  const seniority = typeof data.seniorityLevel === 'string'
    ? seniorityFromText(data.seniorityLevel, 'mid')
    : seniorityFromText(text, 'mid')

  return {
    jobTitles: preferredRoles,
    skills,
    education: stringsFrom(data.education).concat(findTerms(text, ['yh', 'yrkeshogskola', 'bachelor', 'master', 'gymnasium'])),
    experienceYears: extractYears(text),
    languages: unique([...stringsFrom(data.spokenLanguages), ...findTerms(text, ['svenska', 'english', 'engelska', 'arabic', 'arabiska'])]),
    location: unique(findTerms(text, ['goteborg', 'stockholm', 'malmo', 'angered', 'molndal', 'sverige', 'remote'])),
    preferredRoles,
    industries: categories,
    seniorityLevel: seniority,
    liaNeed: data.isLIAEligible === true || data.liaEnabled === true || includesAny(text, ['lia', 'praktik', 'internship']),
    categories,
    licenses: findTerms(text, LICENSE_TERMS),
  }
}

export function parseJobProfile(job: MatchableJob): StructuredJobProfile {
  const text = `${job.title} ${job.description} ${job.requirements ?? ''} ${job.company.industry ?? ''} ${job.jobType ?? ''}`
  const requiredBlock = `${job.title} ${job.requirements ?? ''} ${job.description.slice(0, 1800)}`
  const seniority = job.seniorityLevel
    ? seniorityFromText(job.seniorityLevel)
    : seniorityFromText(text)
  const requiredSkills = findTerms(requiredBlock, SKILLS)
  const allSkills = findTerms(text, SKILLS)

  return {
    title: job.title,
    requiredSkills,
    niceToHaveSkills: unique(allSkills.filter((skill) => !requiredSkills.includes(skill))),
    educationRequirements: findTerms(text, ['yh', 'yrkeshogskola', 'bachelor', 'master', 'gymnasium', 'legitimation']),
    experienceYears: extractYears(text),
    location: unique([job.location, job.city, job.country].filter((value): value is string => Boolean(value))),
    languages: findTerms(text, ['svenska', 'english', 'engelska']),
    seniority,
    jobType: unique([job.jobType ?? '', job.isLia ? 'lia' : '', job.isRemote ? 'remote' : '', job.isHybrid ? 'hybrid' : ''].filter(Boolean)),
    industry: job.company.industry ?? categoriesFromText(text)[0] ?? 'unknown',
    categories: categoriesFromText(text),
    requiredLicenses: findTerms(text, LICENSE_TERMS),
  }
}

export function scoreJobRelevance(cv: StructuredCvProfile, job: StructuredJobProfile): RelevanceScore {
  const matchedSkills = overlap(cv.skills, [...job.requiredSkills, ...job.niceToHaveSkills])
  const matchedNorm = new Set(matchedSkills.map(normalize))
  const missingSkills = unique(job.requiredSkills.filter((skill) => !matchedNorm.has(normalize(skill))))
  const hardRejectReasons: string[] = []
  const cvCategories = cv.categories.length ? cv.categories : ['unknown']
  const jobCategories = job.categories.length ? job.categories : ['unknown']
  const categoryMatch = overlap(cvCategories, jobCategories).length > 0 || jobCategories.includes('unknown')
  const wantsHealthcare = cv.categories.includes('healthcare') || cv.preferredRoles.some((role) => includesAny(role, HEALTHCARE_TERMS))
  const wantsIt = cv.categories.includes('it') || cv.preferredRoles.some((role) => includesAny(role, IT_TERMS))
  const licenseNorm = new Set(cv.licenses.map(normalize))
  const missingLicenses = job.requiredLicenses.filter((license) => !licenseNorm.has(normalize(license)))

  if ((cv.seniorityLevel === 'student' || cv.seniorityLevel === 'junior') && job.seniority === 'senior') {
    hardRejectReasons.push('Rollen ar senior medan CV:t signalerar junior/studentniva.')
  }
  if (wantsIt && job.categories.includes('healthcare') && !wantsHealthcare) {
    hardRejectReasons.push('Rollen ar inom vard/omsorg men CV-malrollen ar IT/frontend.')
  }
  if (!categoryMatch && !cvCategories.includes('unknown') && !jobCategories.includes('unknown')) {
    hardRejectReasons.push('Branschen matchar inte CV:ts mal eller bakgrund.')
  }
  if (missingLicenses.length) {
    hardRejectReasons.push(`Rollen verkar krava licens/certifikat som saknas: ${missingLicenses.join(', ')}.`)
  }

  const roleTerms = unique([...cv.preferredRoles, ...cv.jobTitles])
  const roleMatch = roleTerms.some((role) => includesAny(job.title, [role]) || includesAny(role, [job.title]))
    || (wantsIt && job.categories.includes('it'))
    || overlap(roleTerms, [job.title, ...job.requiredSkills, ...job.niceToHaveSkills]).length > 0
  const experienceRatio = job.experienceYears <= 0
    ? 0.75
    : cv.experienceYears >= job.experienceYears ? 1 : cv.experienceYears / job.experienceYears
  const educationRatio = job.educationRequirements.length === 0
    ? 0.8
    : overlap(cv.education, job.educationRequirements).length > 0 || missingLicenses.length === 0 ? 0.7 : 0.25
  const locationMatch = job.location.length === 0 || cv.location.length === 0
    ? 0.75
    : overlap(cv.location, job.location).length > 0 || job.jobType.includes('remote') ? 1 : 0.45
  const languageMatch = job.languages.length === 0
    ? 0.8
    : overlap(cv.languages, job.languages).length > 0 ? 1 : 0.4
  const careerGoalMatch = roleMatch || categoryMatch ? 1 : 0.15
  const liaBoost = cv.liaNeed && ['lia', 'praktik', 'trainee', 'junior'].some((term) => includesAny(`${job.title} ${job.jobType.join(' ')}`, [term]))
    ? 5
    : 0

  const scoreBreakdown = {
    skills: ratio(matchedSkills.length, Math.max(1, job.requiredSkills.length)) * 35,
    experience: Math.min(1, experienceRatio) * 20,
    education: educationRatio * 15,
    role: (roleMatch ? 1 : categoryMatch ? 0.55 : 0.1) * 15,
    locationLanguage: ((locationMatch + languageMatch) / 2) * 10,
    careerGoal: careerGoalMatch * 5,
  }

  let matchScore = Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0) + liaBoost)
  if (hardRejectReasons.length) matchScore = Math.min(matchScore, 49)
  if (!matchedSkills.length && !roleMatch) matchScore = Math.min(matchScore, 45)
  matchScore = Math.max(0, Math.min(100, matchScore))

  const isRecommended = matchScore >= 55 && hardRejectReasons.length === 0
  const reason = isRecommended
    ? `Relevant match: ${matchedSkills.length ? `matchar ${matchedSkills.join(', ')}` : 'rollen ligger nara kandidatens mal'}, med ${Math.round(scoreBreakdown.skills)} poang for kompetens och ${Math.round(scoreBreakdown.role)} poang for roll/bransch.`
    : `Inte rekommenderad: ${hardRejectReasons[0] ?? 'for svag koppling mellan CV, malroll och jobbannons.'}`

  return {
    matchScore,
    score: matchScore / 20,
    tier: scoreToTier(matchScore),
    isRecommended,
    matchedSkills,
    missingSkills,
    reason,
    improvementTips: missingSkills.length
      ? [`Lyft eller bygg bevis for: ${missingSkills.slice(0, 4).join(', ')}.`]
      : ['Anpassa CV:t med konkreta exempel fran tidigare projekt eller utbildning.'],
    hardRejectReasons,
    cvProfile: cv,
    jobProfile: job,
    scoreBreakdown,
  }
}

export function scoreCvAgainstJob(rawText: string, parsedData: Prisma.JsonValue | null, job: MatchableJob) {
  return scoreJobRelevance(parseCvProfile(rawText, parsedData), parseJobProfile(job))
}
