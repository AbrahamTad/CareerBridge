// Shared contracts for Swedish job discovery, profession mapping, and CV matching.
export type JobOpportunityType = 'jobb' | 'LIA' | 'praktik' | 'internship' | 'trainee'

export type JobSourceKind =
  | 'arbetsformedlingen'
  | 'jobtech-taxonomy'
  | 'offentliga-jobb'
  | 'kommun'
  | 'region'
  | 'company-career-page'
  | 'lia-praktik'
  | 'general'

export type JobSourceCategory =
  | 'general'
  | 'it'
  | 'healthcare'
  | 'kommunal'
  | 'region'
  | 'education'
  | 'trades'
  | 'company'
  | 'lia-praktik'

// Describes a searchable source link, including sources that do not expose a public API.
export interface JobSource {
  id: string
  name: string
  kind: JobSourceKind
  category: JobSourceCategory
  description: string
  url: string
  homePageUrl?: string
  enabled: boolean
}

export interface JobSourceDiagnostic {
  source: string
  enabled: boolean
  status: 'working' | 'configured' | 'disabled' | 'failed'
  responseTimeMs: number
  details: string
  url?: string
}

// Normalized job data keeps source adapters independent from Prisma and the UI.
export interface JobListing {
  externalId: string
  sourceAts: string
  title: string
  description: string
  companyName: string
  companyLogoUrl?: string | null
  sourceUrl?: string | null
  location?: string | null
  city?: string | null
  country?: string | null
  jobType?: string | null
  salary?: string | null
  isRemote?: boolean
  isHybrid?: boolean
  isLia?: boolean
  postedAt?: Date | null
  closingAt?: Date | null
}

// The taxonomy item shape supports deterministic matching when AI providers are unavailable.
export interface ProfessionTaxonomyItem {
  category: string
  profession: string
  keywords: string[]
  swedishKeywords: string[]
  education: string[]
  careerLevel: Array<'Junior' | 'Mid' | 'Senior'>
  jobTypes: JobOpportunityType[]
  matchSignals: Array<'skills' | 'experience' | 'portfolio' | 'certificates' | 'languages' | 'education'>
}

export interface ProfessionRecommendation {
  profession: string
  category: string
  score: number
  matchedSignals: string[]
}

export interface CVProfile {
  skills: string[]
  education: string[]
  workExperience: string[]
  languages: string[]
  certificates: string[]
  careerLevel: 'Junior' | 'Mid' | 'Senior'
  sectors: string[]
  professions: ProfessionRecommendation[]
  jobTypes: JobOpportunityType[]
}

export interface MatchResult {
  matchScore: number
  score: number
  tier: 'strong' | 'medium' | 'weak'
  isRecommended: boolean
  matchedSkills: string[]
  missingSkills: string[]
  recommendations: string[]
  upskillingSuggestions: string[]
}
