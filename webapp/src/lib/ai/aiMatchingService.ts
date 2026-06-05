import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { matchJobToCv } from './service'
import { scoreCvAgainstJob, type RelevanceScore } from './relevanceScorer'

type MatchTier = 'strong' | 'medium' | 'weak'

type MatchableJob = Prisma.JobListingGetPayload<{ include: { company: true } }>

export interface JobMatchAnalysis {
  score: number
  matchScore: number
  tier: MatchTier
  isRecommended: boolean
  matchedSkills: string[]
  reason: string
  strengths: string[]
  missingSkills: string[]
  recommendations: string[]
  recommendation: string
  cvImprovement: string
  suggestedCvImprovements: string[]
  coverLetterAngle: string
  aiSummary: string
  aiReasoning: string
  improvementTips: string[]
  source?: string
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function clampScore(value: unknown) {
  const score = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(score)) return 0
  return Math.max(0, Math.min(5, score))
}

function tierFromScore(score: number): MatchTier {
  if (score >= 4) return 'strong'
  if (score >= 3) return 'medium'
  return 'weak'
}

function normalizeAnalysis(value: Record<string, unknown>): JobMatchAnalysis {
  const rawMatchScore = typeof value.matchScore === 'number' ? value.matchScore : Number(value.matchScore)
  const score = Number.isFinite(rawMatchScore) ? Math.max(0, Math.min(5, rawMatchScore / 20)) : clampScore(value.score)
  const matchScore = Math.round(score * 20)
  const tier = value.tier === 'strong' || value.tier === 'medium' || value.tier === 'weak'
    ? value.tier
    : tierFromScore(score)
  const reason =
    typeof value.reason === 'string' ? value.reason
    : typeof value.aiReasoning === 'string' ? value.aiReasoning
    : typeof value.aiSummary === 'string' ? value.aiSummary
    : 'Matchningen jämför CV, erfarenhet, kompetenser och jobbannonsens krav.'
  const recommendations = asStringArray(value.recommendations)
  const cvImprovement =
    typeof value.cvImprovement === 'string' ? value.cvImprovement
    : asStringArray(value.suggestedCvImprovements)[0] ?? 'Lyft konkreta exempel som matchar jobbannonsens viktigaste krav.'

  return {
    score,
    matchScore,
    tier,
    isRecommended: value.isRecommended === false ? false : matchScore >= 55,
    matchedSkills: asStringArray(value.matchedSkills).length ? asStringArray(value.matchedSkills) : asStringArray(value.strengths),
    reason,
    strengths: asStringArray(value.strengths),
    missingSkills: asStringArray(value.missingSkills),
    recommendations,
    recommendation: typeof value.recommendation === 'string' ? value.recommendation : reason,
    cvImprovement,
    suggestedCvImprovements: asStringArray(value.suggestedCvImprovements).length
      ? asStringArray(value.suggestedCvImprovements)
      : [cvImprovement],
    coverLetterAngle: typeof value.coverLetterAngle === 'string' ? value.coverLetterAngle : 'Koppla motivationen till rollen och arbetsgivarens behov.',
    aiSummary: typeof value.aiSummary === 'string' ? value.aiSummary : reason,
    aiReasoning: reason,
    improvementTips: asStringArray(value.improvementTips).length ? asStringArray(value.improvementTips) : recommendations,
    source: typeof value.source === 'string' ? value.source : 'ai-provider',
  }
}

export function parseMatchAnalysis(text: string): JobMatchAnalysis {
  const parsed = JSON.parse(cleanJson(text)) as Record<string, unknown>
  return normalizeAnalysis(parsed)
}

export function buildLocalMatch(jobTitle: string, jobDescription: string): JobMatchAnalysis {
  const text = jobDescription.toLowerCase()
  const senior = text.includes('senior')
  const strengths = [
    text.includes('team') || text.includes('samarbete') ? 'Rollen verkar värdera samarbete och kommunikation.' : 'Rollen matchar den sökta yrkesinriktningen.',
    text.includes('junior') || text.includes('trainee') || text.includes('lia') ? 'Annonsen verkar öppen för junior/LIA-profil.' : 'Annonsen kan passa om kraven stämmer med CV:t.',
  ]

  return {
    score: senior ? 2.8 : 3.6,
    matchScore: senior ? 56 : 72,
    tier: 'medium',
    isRecommended: !senior,
    matchedSkills: strengths,
    reason: 'Extern AI var inte tillgänglig, så detta är en konservativ lokal matchning.',
    strengths,
    missingSkills: ['Kontrollera annonsens måste-krav manuellt.'],
    recommendations: [`Anpassa CV:t tydligt mot ${jobTitle} och lyft relevanta exempel.`],
    recommendation: 'Möjlig match, men granska annonsen innan ansökan.',
    cvImprovement: 'Lägg till 2-3 konkreta exempel som speglar jobbannonsens viktigaste krav.',
    suggestedCvImprovements: ['Lägg till 2-3 konkreta exempel som speglar jobbannonsens viktigaste krav.'],
    coverLetterAngle: 'Fokusera på motivation, lärande och praktisk erfarenhet kopplad till rollen.',
    aiSummary: 'Extern AI var inte tillgänglig, så detta är en konservativ lokal matchning.',
    aiReasoning: 'Matchningen bygger på jobbannonsens text och generella signaler, inte full AI-analys.',
    improvementTips: ['Granska annonsens krav manuellt innan du ansoker.'],
    source: 'local-fallback',
  }
}

function analysisFromRelevance(relevance: RelevanceScore, source = 'deterministic-relevance'): JobMatchAnalysis {
  return {
    score: relevance.score,
    matchScore: relevance.matchScore,
    tier: relevance.tier,
    isRecommended: relevance.isRecommended,
    matchedSkills: relevance.matchedSkills,
    reason: relevance.reason,
    strengths: relevance.matchedSkills.length ? relevance.matchedSkills : ['Ingen tydlig stark match hittades.'],
    missingSkills: relevance.missingSkills,
    recommendations: relevance.improvementTips,
    recommendation: relevance.isRecommended ? 'Rekommenderad att granska och eventuellt soka.' : 'Inte rekommenderad for denna CV-profil.',
    cvImprovement: relevance.improvementTips[0] ?? 'Lyft konkreta bevis som matchar rollen.',
    suggestedCvImprovements: relevance.improvementTips,
    coverLetterAngle: relevance.isRecommended
      ? 'Koppla brevet till matchande kompetenser och rollens viktigaste krav.'
      : 'Sok hellre roller som ligger narmare CV:ts mal och kompetenser.',
    aiSummary: relevance.reason,
    aiReasoning: relevance.reason,
    improvementTips: relevance.improvementTips,
    source,
  }
}

function mergeAiWithRelevance(ai: JobMatchAnalysis, relevance: RelevanceScore): JobMatchAnalysis {
  const matchScore = Math.min(relevance.matchScore, ai.matchScore || Math.round(ai.score * 20))
  const isRecommended = relevance.isRecommended && matchScore >= 55 && ai.isRecommended !== false

  return {
    ...ai,
    score: matchScore / 20,
    matchScore,
    tier: matchScore >= 75 ? 'strong' : matchScore >= 55 ? 'medium' : 'weak',
    isRecommended,
    matchedSkills: relevance.matchedSkills.length ? relevance.matchedSkills : ai.matchedSkills,
    missingSkills: relevance.missingSkills.length ? relevance.missingSkills : ai.missingSkills,
    reason: isRecommended ? ai.reason : relevance.reason,
    strengths: relevance.matchedSkills.length ? relevance.matchedSkills : ai.strengths,
    recommendations: ai.recommendations.length ? ai.recommendations : relevance.improvementTips,
    improvementTips: ai.improvementTips.length ? ai.improvementTips : relevance.improvementTips,
    aiReasoning: `${relevance.reason} ${ai.aiReasoning}`,
    source: 'deterministic-plus-ai',
  }
}

function buildJobContext(job: MatchableJob) {
  return [
    `Title: ${job.title}`,
    `Employer: ${job.company.name}`,
    `Location: ${job.location ?? job.city ?? 'Not specified'}`,
    job.requirements ? `Requirements: ${job.requirements.slice(0, 800)}` : '',
    `Description: ${(job.description ?? '').slice(0, 1800)}`,
  ].filter(Boolean).join('\n\n')
}

type CvInput = { rawText: string; cleanedMarkdown?: string | null; parsedData: Prisma.JsonValue | null }

function buildCvContext(cv: CvInput) {
  const parsed = cv.parsedData && typeof cv.parsedData === 'object' && !Array.isArray(cv.parsedData)
    ? cv.parsedData as Record<string, unknown>
    : null
  const meta = parsed ? [
    Array.isArray(parsed.skills) ? `Skills: ${(parsed.skills as string[]).join(', ')}` : '',
    Array.isArray(parsed.targetRoles) ? `Target roles: ${(parsed.targetRoles as string[]).join(', ')}` : '',
    typeof parsed.seniorityLevel === 'string' ? `Level: ${parsed.seniorityLevel}` : '',
    Array.isArray(parsed.sectors) ? `Sectors: ${(parsed.sectors as string[]).join(', ')}` : '',
  ].filter(Boolean).join('\n') : ''

  // Use cleanedMarkdown when available — better structure, fewer tokens
  const cvBody = cv.cleanedMarkdown?.trim() || cv.rawText
  return meta ? `${meta}\n\nCV:\n${cvBody.slice(0, 12000)}` : `CV:\n${cvBody.slice(0, 12000)}`
}

export async function analyzeJobMatch(cv: CvInput, job: MatchableJob) {
  const relevance = scoreCvAgainstJob(cv.rawText, cv.parsedData, job)
  if (!relevance.isRecommended) {
    return analysisFromRelevance(relevance)
  }

  const matchText = await matchJobToCv(
    buildCvContext(cv),
    buildJobContext(job),
    job.title
  )

  return mergeAiWithRelevance(parseMatchAnalysis(matchText), relevance)
}

export function buildDeterministicMatch(cv: CvInput, job: MatchableJob) {
  return analysisFromRelevance(scoreCvAgainstJob(cv.rawText, cv.parsedData, job), 'local-relevance')
}

export async function saveJobMatch(userId: string, cvId: string, jobListingId: string, analysis: JobMatchAnalysis) {
  const rawAnalysis = {
    ...analysis,
    reason: analysis.reason,
    suggestedCvImprovements: analysis.suggestedCvImprovements,
    matchScore: analysis.matchScore,
    isRecommended: analysis.isRecommended,
    matchedSkills: analysis.matchedSkills,
    improvementTips: analysis.improvementTips,
  } as Prisma.InputJsonObject

  return prisma.jobMatch.upsert({
    where: { userId_jobListingId: { userId, jobListingId } },
    create: {
      userId,
      jobListingId,
      cvId,
      score: analysis.score,
      tier: analysis.tier,
      missingSkills: analysis.missingSkills,
      strengths: analysis.strengths,
      recommendations: analysis.recommendations,
      recommendation: analysis.recommendation,
      cvImprovement: analysis.cvImprovement,
      coverLetterAngle: analysis.coverLetterAngle,
      aiSummary: analysis.aiSummary,
      aiReasoning: analysis.aiReasoning,
      rawAnalysis,
    },
    update: {
      cvId,
      score: analysis.score,
      tier: analysis.tier,
      missingSkills: analysis.missingSkills,
      strengths: analysis.strengths,
      recommendations: analysis.recommendations,
      recommendation: analysis.recommendation,
      cvImprovement: analysis.cvImprovement,
      coverLetterAngle: analysis.coverLetterAngle,
      aiSummary: analysis.aiSummary,
      aiReasoning: analysis.aiReasoning,
      rawAnalysis,
    },
  })
}

export async function analyzeAndSaveJobMatch(userId: string, cv: CvInput & { id: string }, job: MatchableJob) {
  const analysis = await analyzeJobMatch(cv, job)
  return saveJobMatch(userId, cv.id, job.id, analysis)
}
