// CV-driven Swedish job search with taxonomy expansion, caching, and partial-result fallbacks.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireAuth, isAuthResponse } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')

  const task = taskId
    ? await prisma.searchTask.findFirst({
        where: { id: taskId, userId: auth.dbUserId },
      })
    : await prisma.searchTask.findFirst({
        where: {
          userId: auth.dbUserId,
          type: 'JOB_SCAN',
          status: { in: ['RUNNING', 'COMPLETED'] },
        },
        orderBy: { updatedAt: 'desc' },
      })

  if (!task) {
    return NextResponse.json({ progress: 0, currentStep: 'Starting…', status: 'PENDING' })
  }

  return NextResponse.json({
    taskId: task.id,
    status: task.status,
    progress: task.progress,
    currentStep: task.currentStep,
    sourcesScanned: task.sourcesScanned,
    jobsFound: task.jobsFound,
    companiesFound: task.companiesFound,
    matchesFound: task.matchesFound,
  })
}

import { analyzeAndSaveJobMatch, buildDeterministicMatch, saveJobMatch } from '@/lib/ai/aiMatchingService'
import { generateJobSearchQueries, getCvText, getFriendlyAIError } from '@/lib/ai/service'
import type { ExternalJob } from '@/lib/jobs/jobtech'
import { expandJobSearchLocations, locationLabelForSearch } from '@/lib/jobs/locations'
import { persistExternalJobs } from '@/lib/jobs/persist'
import { verifyActiveJobIds } from '@/lib/jobs/liveness'
import { hasReachedAiLimit } from '@/lib/subscription'
import { hasCareProfile, recommendLocalProfessions } from '@/lib/jobs/profession-taxonomy'
import { aggregateSwedishJobs } from '@/lib/jobs/sources'
import type { JobSource, JobSourceDiagnostic, ProfessionRecommendation } from '@/lib/jobs/types'

const CACHE_MINUTES = 20
const MAX_IMPORTED_JOBS = 60
const MAX_AUTO_MATCHES = 12
const MAX_SEARCH_TERMS = 8

type SearchData = {
  titles: string[]
  skills: string[]
  level: string
  summary: string
  isLIAEligible?: boolean
  liaTerms?: string[]
}

function cleanJson(text: string) {
  return text.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim()
}

function uniqueTerms(terms: string[], max = MAX_SEARCH_TERMS) {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const term of terms.map((value) => value.trim()).filter(Boolean)) {
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(term)
  }

  return unique.slice(0, max)
}

function stringsFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function searchDataFromParsedCv(parsedData: Prisma.JsonValue | null): SearchData | null {
  if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) return null
  const data = parsedData as Record<string, unknown>
  const titles = stringsFromJson(data.targetRoles)
  const skills = stringsFromJson(data.skills)
  const summary = typeof data.summary === 'string' ? data.summary : 'CV profile graph reused from your latest analysis.'

  if (!titles.length && !skills.length) return null
  return {
    titles,
    skills,
    level: typeof data.seniorityLevel === 'string' ? data.seniorityLevel : 'junior',
    summary,
    isLIAEligible: data.isLIAEligible === true,
    liaTerms: stringsFromJson(data.liaTerms),
  }
}

async function updateTask(taskId: string, data: Prisma.SearchTaskUpdateInput) {
  try {
    await prisma.searchTask.update({ where: { id: taskId }, data })
  } catch {
    // Task telemetry should never break the user-facing search.
  }
}

async function findCachedTask(userId: string, queryText: string, location: string) {
  const since = new Date(Date.now() - CACHE_MINUTES * 60 * 1000)
  const tasks = await prisma.searchTask.findMany({
    where: {
      userId,
      type: 'JOB_SCAN',
      status: 'COMPLETED',
      queryText,
      location,
      updatedAt: { gte: since },
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  })

  return tasks.find((task) => {
    const results = task.results
    if (!results || typeof results !== 'object' || Array.isArray(results)) return false
    const data = results as Record<string, unknown>
    return Array.isArray(data.searchedFor) || typeof data.candidateSummary === 'string' || typeof data.totalFound === 'number'
  }) ?? null
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (isAuthResponse(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const liaOnly = body.liaOnly === true
  const demoRequested = body.demoMode === true
  const useCache = body.useCache !== false
  let location = typeof body.location === 'string' ? body.location.trim() : ''

  const cv = await prisma.cV.findFirst({ where: { userId: auth.dbUserId, isActive: true } })
  if (!cv) return NextResponse.json({ error: 'No CV found. Upload a CV first.' }, { status: 400 })

  const subscription = await prisma.subscription.findUnique({ where: { userId: auth.dbUserId } })
  if (hasReachedAiLimit(subscription)) {
    return NextResponse.json({ error: 'Monthly AI limit reached.' }, { status: 429 })
  }

  if (!location) {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: auth.dbUserId },
      select: { city: true, location: true },
    })
    location = profile?.city || profile?.location || ''
  }

  const queryText = query || 'cv-driven-search'
  // Reuse recent equivalent searches unless the dashboard explicitly requests a deeper scan.
  const cachedTask = useCache ? await findCachedTask(auth.dbUserId, queryText, location) : null
  if (cachedTask?.results && typeof cachedTask.results === 'object' && !Array.isArray(cachedTask.results)) {
    return NextResponse.json({ ...(cachedTask.results as Record<string, unknown>), cached: true, taskId: cachedTask.id })
  }

  const searchTask = await prisma.searchTask.create({
    data: {
      userId: auth.dbUserId,
      type: 'JOB_SCAN',
      status: 'RUNNING',
      query: { query, location, source: 'jobtech', mode: 'ai-graph-search' },
      queryText,
      location,
      progress: 8,
      currentStep: 'Reading your CV',
      startedAt: new Date(),
    },
  })

  let searchData: SearchData | null = searchDataFromParsedCv(cv.parsedData)
  let usedCvCache = Boolean(searchData)

  // Prefer cleanedMarkdown for AI queries — more structured, fewer tokens
  const cvText = getCvText(cv)

  if (!searchData) {
    try {
      await updateTask(searchTask.id, { progress: 18, currentStep: 'Extracting skills and experience' })
      const raw = await generateJobSearchQueries(cvText)
      searchData = JSON.parse(cleanJson(raw)) as SearchData

      if (subscription) {
        await prisma.subscription.update({
          where: { userId: auth.dbUserId },
          data: { aiCallsThisMonth: { increment: 1 } },
        })
      }
    } catch (err: unknown) {
      const { message } = getFriendlyAIError(err, 'CV analysis failed')
      console.warn('Smart search CV analysis fallback', { message })
      searchData = {
        titles: query ? [query] : ['Frontend Developer', 'Frontendutvecklare', 'QA Testare', 'Webbutvecklare'],
        skills: ['React', 'JavaScript', 'Cypress'],
        level: 'junior',
        isLIAEligible: false,
        liaTerms: [],
        summary: 'Local profile graph created from available search inputs.',
      }
    }
  }

  if (!searchData) {
    searchData = {
      titles: query ? [query] : ['Frontend Developer', 'Frontendutvecklare', 'QA Testare', 'Webbutvecklare'],
      skills: ['React', 'JavaScript', 'Cypress'],
      level: 'junior',
      isLIAEligible: false,
      liaTerms: [],
      summary: 'Local profile graph created from available search inputs.',
    }
  }

  await updateTask(searchTask.id, { progress: 32, currentStep: 'Building candidate profile graph' })

  const titleTerms = Array.isArray(searchData.titles) ? searchData.titles : []
  const skillTerms = Array.isArray(searchData.skills) ? searchData.skills.slice(0, 3) : []

  // Auto-include LIA terms when CV shows YH eligibility or liaOnly flag is set
  const isLIAProfile = liaOnly || searchData.isLIAEligible === true
  const liaSearchTerms = isLIAProfile
    ? (searchData.liaTerms?.length ? searchData.liaTerms : ['LIA praktik', 'praktikplats', 'trainee internship'])
    : []

  const searchTerms = uniqueTerms([query, ...titleTerms, ...skillTerms, ...liaSearchTerms], MAX_SEARCH_TERMS)

  let demoMode = false
  let foundJobs: ExternalJob[] = []
  let additionalSources: JobSource[] = []
  let sourceStatuses: JobSourceDiagnostic[] = []
  const searchLocations = expandJobSearchLocations(location)
  const expandedLocationSearch = searchLocations.length > 1
  const cvParsed = cv.parsedData && typeof cv.parsedData === 'object' && !Array.isArray(cv.parsedData)
    ? cv.parsedData as Record<string, unknown>
    : {}
  // Local taxonomy recommendations enrich search terms even when provider-backed analysis fails.
  const careProfile = hasCareProfile(cvText)
  const localProfessionRecommendations = recommendLocalProfessions(cvText)
  const professionTerms = localProfessionRecommendations
    .slice(0, careProfile ? 10 : 3)
    .map((profession) => profession.profession)
  const professionSearchTerms = uniqueTerms(
    [query, ...professionTerms, ...searchTerms],
    careProfile ? 10 : MAX_SEARCH_TERMS
  )
  let sourceCount = professionSearchTerms.length * searchLocations.length

  const cvSectors = Array.isArray(cvParsed.sectors)
    ? (cvParsed.sectors as string[])
    : localProfessionRecommendations.map((profession) => profession.category)

  try {
    await updateTask(searchTask.id, { progress: 46, currentStep: 'Searching job sources', sourcesScanned: sourceCount })
    const searchResult = await aggregateSwedishJobs(
      professionSearchTerms,
      searchLocations,
      expandedLocationSearch ? 6 : 12,
      cvSectors,
      isLIAProfile
    )
    foundJobs = searchResult.jobs
    additionalSources = searchResult.sourceLinks
    sourceStatuses = searchResult.diagnostics
    sourceCount = searchResult.searchesRun
  } catch {
    // Source failures degrade to an empty result set so the route can still finish cleanly.
    foundJobs = []
  }

  if (!foundJobs.length && demoRequested) {
    // Demo mode is explicit only; normal search should never show fake postings.
    demoMode = true
    foundJobs = []
  }

  const companyCount = new Set(foundJobs.map((job) => job.companyName.toLowerCase())).size
  await updateTask(searchTask.id, {
    progress: 62,
    currentStep: 'Discovering companies',
    jobsFound: foundJobs.length,
    companiesFound: companyCount,
  })

  const externalJobs = foundJobs.slice(0, MAX_IMPORTED_JOBS).map((job) => ({
    ...job,
    // When the user starts a LIA-focused search, keep imported results visible under the LIA filter.
    isLia: liaOnly || job.isLia,
  }))
  const { ids: persistedJobIds, newCount } = await persistExternalJobs(externalJobs)
  let jobIds = demoMode ? persistedJobIds : await verifyActiveJobIds(persistedJobIds)

  await updateTask(searchTask.id, {
    progress: 74,
    currentStep: 'Connecting CV skills to job requirements',
    jobsFound: jobIds.length,
  })

  const existingMatches = await prisma.jobMatch.findMany({
    where: { userId: auth.dbUserId, jobListingId: { in: jobIds } },
    select: { jobListingId: true, score: true },
  })
  const alreadyMatchedIds = new Set(existingMatches.map((m) => m.jobListingId))
  const unscoredIds = jobIds.filter((id) => !alreadyMatchedIds.has(id))

  // Step 1: run the fast deterministic scorer on ALL unscored jobs so every imported
  // job gets a score — not just the first MAX_AUTO_MATCHES.
  const unscoredListings = unscoredIds.length
    ? await prisma.jobListing.findMany({
        where: { id: { in: unscoredIds } },
        include: { company: true },
      })
    : []

  const deterministicScores = new Map<string, number>()
  await Promise.allSettled(
    unscoredListings.map(async (listing) => {
      if (!listing.description) return
      const det = buildDeterministicMatch(cv, listing)
      deterministicScores.set(listing.id, det.score)
      if (det.score < 2.0) return // skip saving clearly irrelevant jobs
      await saveJobMatch(auth.dbUserId, cv.id, listing.id, det)
    })
  )

  // Step 2: AI-score only the top deterministic candidates to get richer reasoning.
  const topForAI = unscoredListings
    .filter((l) => (deterministicScores.get(l.id) ?? 0) >= 2.5)
    .sort((a, b) => (deterministicScores.get(b.id) ?? 0) - (deterministicScores.get(a.id) ?? 0))
    .slice(0, MAX_AUTO_MATCHES)

  let matchedCount = existingMatches.filter((m) => m.score >= 2.75).length

  await Promise.allSettled(
    topForAI.map(async (jobListing) => {
      if (!jobListing.description) return
      try {
        const match = await analyzeAndSaveJobMatch(auth.dbUserId, cv, jobListing)
        if (match.score >= 2.75) matchedCount++
      } catch {
        // Deterministic score already saved — AI failure is a non-fatal degradation.
        if ((deterministicScores.get(jobListing.id) ?? 0) >= 2.75) matchedCount++
      }
    })
  )

  // Count deterministic-only passes as matches too
  for (const [id, score] of deterministicScores) {
    if (score >= 2.75 && !topForAI.find((l) => l.id === id)) matchedCount++
  }

  if (subscription && topForAI.length > 0) {
    await prisma.subscription.update({
      where: { userId: auth.dbUserId },
      data: { aiCallsThisMonth: { increment: topForAI.length } },
    })
  }

  const recommendedMatches = await prisma.jobMatch.findMany({
    where: {
      userId: auth.dbUserId,
      jobListingId: { in: jobIds },
      score: { gte: 2.5 },
    },
    select: { jobListingId: true },
  })
  const recommendedIds = new Set(recommendedMatches.map((match) => match.jobListingId))
  jobIds = jobIds.filter((jobId) => recommendedIds.has(jobId))

  const response = {
    newJobs: newCount,
    totalFound: foundJobs.length,
    imported: jobIds.length,
    expiredSkipped: persistedJobIds.length - jobIds.length,
    autoMatched: matchedCount,
    searchedFor: professionSearchTerms,
    location: locationLabelForSearch(location),
    searchedLocations: searchLocations.filter(Boolean),
    candidateSummary: searchData.summary,
    source: demoMode ? 'Demo mode' : 'JobTech/Platsbanken',
    sources: demoMode ? ['demo'] : ['arbetsformedlingen-jobtech', 'jobtech-taxonomy', 'kommun', 'region', 'company-career-pages', 'lia-praktik'],
    additionalSources,
    sourceStatuses,
    professionRecommendations: localProfessionRecommendations satisfies ProfessionRecommendation[],
    liaMode: isLIAProfile,
    demoMode,
    usedCvCache,
    taskId: searchTask.id,
    partial: true,
    canRunDeeper: foundJobs.length >= MAX_IMPORTED_JOBS,
    jobIds,
  }

  // Preserve source links so cached searches keep the same municipality, region, and employer shortcuts.
  const dbResults = response as unknown as Prisma.InputJsonObject

  await updateTask(searchTask.id, {
    status: 'COMPLETED',
    progress: 100,
    currentStep: 'Preparing recommendations',
    matchesFound: matchedCount,
    completedAt: new Date(),
    results: dbResults,
  })

  return NextResponse.json(response)
}
