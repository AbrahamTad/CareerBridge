import type { User, UserProfile, CV, JobListing, Company, JobMatch, Application, GeneratedCV, CoverLetter, Subscription } from '@prisma/client'

export type { User, UserProfile, CV, JobListing, Company, JobMatch, Application, GeneratedCV, CoverLetter, Subscription }
export type { AIProvider } from '@/lib/ai/types'
export type {
  CVProfile as SwedishCVProfile,
  JobListing as SwedishJobListing,
  JobSource,
  MatchResult,
  ProfessionRecommendation,
  ProfessionTaxonomyItem,
} from '@/lib/jobs/types'

export type UserWithProfile = User & {
  profile: UserProfile | null
  subscription: Subscription | null
}

export type JobListingWithCompany = JobListing & {
  company: Company
}

export type JobMatchWithListing = JobMatch & {
  jobListing: JobListingWithCompany
}

export type ApplicationWithListing = Application & {
  jobListing: (JobListing & { company: Company }) | null
}

export interface CVAnalysis {
  skills: string[]
  tools: string[]
  languages: string[]
  spokenLanguages: string[]
  education: Array<{
    degree: string
    field: string
    institution: string
    year?: string
  }>
  experience: Array<{
    title: string
    company: string
    duration: string
    highlights: string[]
  }>
  projects: Array<{
    name: string
    description: string
    technologies: string[]
  }>
  summary: string
  targetRoles: string[]
  seniorityLevel: string
}

export interface JobMatchResult {
  score: number
  tier: 'strong' | 'medium' | 'weak'
  strengths: string[]
  missingSkills: string[]
  recommendations: string[]
  aiSummary: string
  aiReasoning: string
}

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export type AppStatusType = 'SAVED' | 'APPLIED' | 'RESPONDED' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'DISCARDED'

export const APP_STATUS_LABELS: Record<AppStatusType, string> = {
  SAVED: 'Sparad',
  APPLIED: 'Ansökt',
  RESPONDED: 'Svar erhållet',
  INTERVIEW: 'Intervju',
  OFFER: 'Erbjudande',
  REJECTED: 'Avslag',
  DISCARDED: 'Avvikad',
}

export const APP_STATUS_COLORS: Record<AppStatusType, string> = {
  SAVED: 'bg-slate-100 text-slate-700',
  APPLIED: 'bg-blue-100 text-blue-700',
  RESPONDED: 'bg-purple-100 text-purple-700',
  INTERVIEW: 'bg-yellow-100 text-yellow-700',
  OFFER: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  DISCARDED: 'bg-gray-100 text-gray-500',
}
