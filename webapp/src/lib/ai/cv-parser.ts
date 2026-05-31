// CV text extraction and structured parsing from uploaded files
import { convertToMarkdown, cleanMarkdown, extractCVStructure } from '@/lib/cv/markitdown-service'
import { hasCareProfile, recommendLocalProfessions } from '@/lib/jobs/profession-taxonomy'
import type { CVProfile as SwedishCVProfile } from '@/lib/jobs/types'
export type { CVStructuredData } from '@/lib/cv/markitdown-service'

/**
 * Convert an uploaded CV file to clean Markdown using MarkItDown service.
 * Returns both the raw Markdown and the cleaned version ready for AI use.
 */
export async function extractMarkdownFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<{ rawMarkdown: string; cleanedMarkdown: string; structuredData: ReturnType<typeof extractCVStructure> }> {
  const rawMarkdown = await convertToMarkdown(buffer, mimeType)
  const cleanedMarkdown = cleanMarkdown(rawMarkdown)
  const structuredData = extractCVStructure(cleanedMarkdown)
  return { rawMarkdown, cleanedMarkdown, structuredData }
}

/**
 * Extract plain text from common CV upload formats when Markdown conversion is not needed.
 * Unsupported formats fail early so the upload route can show a clear validation error.
 */
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8')
  }

  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)
    return data.text
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error(`Unsupported file type: ${mimeType}`)
}

export function validateCVText(text: string): { valid: boolean; error?: string } {
  if (text.length < 100) {
    return { valid: false, error: 'CV verkar vara för kort. Kontrollera att filen innehåller text.' }
  }
  if (text.length > 50000) {
    return { valid: false, error: 'CV är för långt. Maximalt 50 000 tecken.' }
  }
  return { valid: true }
}

export interface CVProfile extends SwedishCVProfile {
  techStack: string[]
  healthcareStack: string[]
  educationStack: string[]
  tradesStack: string[]
  languages: string[]
  isLIAEligible: boolean
  hasQAExperience: boolean
  hasFrontendExperience: boolean
  hasAIExperience: boolean
  hasHealthcareExperience: boolean
  hasEducationExperience: boolean
  hasTradesExperience: boolean
  educationLevel: 'yh' | 'university' | 'bootcamp' | 'unknown'
  swedishLevel: 'native' | 'b2' | 'b1' | 'none' | 'unknown'
  locationMentioned: string[]
  seniorityLevel: 'junior' | 'mid' | 'senior'
  targetRoles: string[]
}

const FRONTEND_SIGNALS = ['react', 'typescript', 'javascript', 'next.js', 'vue', 'angular', 'html', 'css', 'tailwind', 'styled components', 'responsive']
const QA_SIGNALS = ['cypress', 'playwright', 'jest', 'testing library', 'qa', 'quality assurance', 'testare', 'e2e', 'end-to-end', 'test automation']
const AI_SIGNALS = ['python', 'machine learning', 'ml', 'ai', 'scikit', 'lightgbm', 'tensorflow', 'pytorch', 'onnx', 'neural', 'llm']
const HEALTHCARE_SIGNALS = ['undersköterska', 'sjuksköterska', 'vård', 'omsorg', 'hemtjänst', 'äldreomsorg', 'LSS', 'boendestöd', 'stödassistent', 'funktionsstöd', 'bmss', 'personlig assistent']
const EDUCATION_SIGNALS = ['lärare', 'pedagog', 'förskollärare', 'specialpedagog', 'skola', 'undervisning', 'elevassistent']
const TRADES_SIGNALS = ['elektriker', 'snickare', 'bilmekaniker', 'fordonstekniker', 'svetsare', 'rörläggare', 'kock', 'lagerarbetare']
const TECH_KEYWORDS = [
  // Frontend
  'react', 'typescript', 'javascript', 'node.js', 'next.js', 'vue', 'angular', 'html', 'css', 'tailwind',
  // Testing
  'cypress', 'playwright', 'jest',
  // Backend / DB
  'python', 'docker', 'aws', 'azure', 'sql', 'graphql', 'rest', 'prisma', 'sqlite', 'express', 'flask',
  // AI/ML
  'scikit-learn', 'lightgbm', 'onnx', 'tensorflow', 'pytorch',
  // Tools
  'git', 'github', 'figma', 'jira',
]
// Healthcare / Social care keywords
const HEALTHCARE_KEYWORDS = [
  'vård', 'omsorg', 'hemtjänst', 'äldreomsorg', 'LSS', 'boendestöd',
  'undersköterska', 'sjuksköterska', 'funktionsstöd', 'stödassistent',
  'personlig assistent', 'BMSS', 'medicin', 'journaldokumentation',
]
// Education keywords
const EDUCATION_KEYWORDS = ['lärare', 'pedagog', 'förskollärare', 'specialpedagog', 'elevassistent', 'skola', 'IUP']
// Trades keywords
const TRADES_KEYWORDS = ['elektriker', 'snickare', 'bilmekaniker', 'fordonstekniker', 'kock', 'lager', 'truckkort']

const YH_SIGNALS = ['yrkeshögskola', 'yh', 'medieinstitutet', 'lia', 'lärande i arbete']
const CERTIFICATE_SIGNALS = ['b-körkort', 'körkort', 'truckkort', 'delegering', 'hlr', 'brandutbildning', 'legitimation', 'undersköterskebevis', 'certifikat']
const SWEDEN_LOCATIONS = ['göteborg', 'stockholm', 'malmö', 'lund', 'uppsala', 'gothenburg', 'sweden', 'sverige']

/**
 * Extract a structured profile from raw CV text.
 * Purely heuristic — covers IT, healthcare, education, trades.
 * No LLM required: runs instantly on CV upload.
 */
export function parseCVProfile(text: string): CVProfile {
  const lower = text.toLowerCase()

  const techStack = TECH_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()))
  const healthcareStack = HEALTHCARE_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()))
  const educationStack = EDUCATION_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()))
  const tradesStack = TRADES_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()))

  const languages: string[] = []
  if (/\b(swedish|svenska)\b/i.test(text)) languages.push('Swedish')
  if (/\b(english|engelska)\b/i.test(text)) languages.push('English')
  if (/\b(arabic|arabiska)\b/i.test(text)) languages.push('Arabic')
  if (/\b(somali|somaliska)\b/i.test(text)) languages.push('Somali')
  if (/\b(amharic|amhariska)\b/i.test(text)) languages.push('Amharic')
  if (/\b(oromo)\b/i.test(text)) languages.push('Oromo')
  if (/\b(spanish|spanska)\b/i.test(text)) languages.push('Spanish')
  if (/\b(arabic|arabiska)\b/i.test(text)) languages.push('Arabic')

  const isLIAEligible = YH_SIGNALS.some((s) => lower.includes(s))
  const certificates = CERTIFICATE_SIGNALS.filter((s) => lower.includes(s))
  const hasFrontendExperience = FRONTEND_SIGNALS.filter((s) => lower.includes(s)).length >= 3
  const hasQAExperience = QA_SIGNALS.filter((s) => lower.includes(s)).length >= 2
  const hasAIExperience = AI_SIGNALS.filter((s) => lower.includes(s)).length >= 2
  const hasHealthcareExperience = HEALTHCARE_SIGNALS.filter((s) => lower.includes(s)).length >= 2
  const hasEducationExperience = EDUCATION_SIGNALS.filter((s) => lower.includes(s)).length >= 2
  const hasTradesExperience = TRADES_SIGNALS.filter((s) => lower.includes(s)).length >= 2

  let educationLevel: CVProfile['educationLevel'] = 'unknown'
  if (YH_SIGNALS.some((s) => lower.includes(s))) educationLevel = 'yh'
  else if (/\b(university|högskola|bachelor|master|bsc|msc|civilingenjör)\b/i.test(text)) educationLevel = 'university'
  else if (/\b(bootcamp|academy|coding school)\b/i.test(text)) educationLevel = 'bootcamp'

  let swedishLevel: CVProfile['swedishLevel'] = 'unknown'
  if (/svenska.*\b(native|modersmål)\b/i.test(text)) swedishLevel = 'native'
  else if (/\b(b2|good working)\b.*sven/i.test(text) || /sven.*\b(b2)\b/i.test(text)) swedishLevel = 'b2'
  else if (/\b(b1|basic|grundläggande)\b.*sven/i.test(text)) swedishLevel = 'b1'
  else if (/\b(swedish|svenska)\b/i.test(text)) swedishLevel = 'b2'

  const locationMentioned = SWEDEN_LOCATIONS.filter((loc) => lower.includes(loc))

  const seniorityLevel: CVProfile['seniorityLevel'] =
    /\b(senior|lead|principal|architect|chef)\b/i.test(text) ? 'senior'
    : /\b(junior|student|lia|intern|nyexaminerad|entry.?level)\b/i.test(text) ? 'junior'
    : 'mid'

  // Infer target roles from detected experience (used as search terms)
  const targetRoles: string[] = []
  if (hasFrontendExperience) targetRoles.push('Frontend Developer', 'Frontendutvecklare')
  if (hasQAExperience) targetRoles.push('QA Engineer', 'Testare')
  if (hasAIExperience) targetRoles.push('AI Engineer', 'Machine Learning Developer')
  if (hasHealthcareExperience) targetRoles.push('Undersköterska', 'Stödassistent')
  if (hasEducationExperience) targetRoles.push('Lärare', 'Pedagog')
  if (hasTradesExperience) targetRoles.push('Tekniker')
  if (!targetRoles.length && techStack.length) targetRoles.push('Systemutvecklare', 'Software Developer')
  // Add taxonomy recommendations so uploaded CVs can drive Swedish searches without an AI call.
  const professions = recommendLocalProfessions(text)
  const taxonomyRoles = professions.map((recommendation) => recommendation.profession)
  // Care profiles preserve the requested care-role order ahead of general recommendations.
  const prioritizedTargetRoles = Array.from(new Set([
    ...(hasCareProfile(text) ? taxonomyRoles : []),
    ...targetRoles,
    ...taxonomyRoles,
  ])).slice(0, hasCareProfile(text) ? 12 : 8)
  const sectors = Array.from(new Set(professions.map((recommendation) => recommendation.category)))
  const careerLevel: CVProfile['careerLevel'] =
    seniorityLevel === 'junior' ? 'Junior'
    : seniorityLevel === 'senior' ? 'Senior'
    : 'Mid'

  return {
    skills: [...techStack, ...healthcareStack, ...educationStack, ...tradesStack],
    education: [],
    workExperience: [],
    certificates,
    careerLevel,
    sectors,
    professions,
    jobTypes: isLIAEligible ? ['jobb', 'LIA', 'praktik', 'internship', 'trainee'] : ['jobb'],
    techStack,
    healthcareStack,
    educationStack,
    tradesStack,
    languages: Array.from(new Set(languages)),
    isLIAEligible,
    hasQAExperience,
    hasFrontendExperience,
    hasAIExperience,
    hasHealthcareExperience,
    hasEducationExperience,
    hasTradesExperience,
    educationLevel,
    swedishLevel,
    locationMentioned,
    seniorityLevel,
    targetRoles: prioritizedTargetRoles,
  }
}

/**
 * Convert a CVProfile into the parsedData shape that smart-search and analyze-cv expect.
 * Stored in prisma.cV.parsedData so smart-search skips the AI extraction step.
 */
export function cvProfileToParsedData(profile: CVProfile): Record<string, unknown> {
  return {
    skills: [...profile.techStack, ...profile.healthcareStack, ...profile.educationStack, ...profile.tradesStack],
    tools: profile.techStack.filter((s) => ['git', 'github', 'figma', 'jira', 'docker'].includes(s)),
    languages: profile.techStack.filter((s) => ['javascript', 'typescript', 'python', 'sql'].includes(s)),
    spokenLanguages: profile.languages,
    education: [],
    experience: [],
    projects: [],
    summary: `CV profile: ${profile.targetRoles.slice(0, 3).join(', ')}${profile.isLIAEligible ? ' (LIA-eligible)' : ''}. ${profile.seniorityLevel} level.`,
    targetRoles: profile.targetRoles,
    seniorityLevel: profile.seniorityLevel,
    isLIAEligible: profile.isLIAEligible,
    certificates: profile.certificates,
    sectors: profile.sectors,
    professionRecommendations: profile.professions,
    jobTypes: profile.jobTypes,
    source: 'local-cv-parser',
  }
}
