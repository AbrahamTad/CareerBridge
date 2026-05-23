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

import { analyzeAndSaveJobMatch } from '@/lib/ai/aiMatchingService'
import { generateJobSearchQueries, getFriendlyAIError } from '@/lib/ai/service'
import { searchJobTech, uniqueExternalJobs, type ExternalJob } from '@/lib/jobs/jobtech'
import { expandJobSearchLocations, locationLabelForSearch } from '@/lib/jobs/locations'
import { persistExternalJobs } from '@/lib/jobs/persist'
import { verifyActiveJobIds } from '@/lib/jobs/liveness'
import { hasReachedAiLimit } from '@/lib/subscription'

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

  if (!searchData) {
    try {
      await updateTask(searchTask.id, { progress: 18, currentStep: 'Extracting skills and experience' })
      const raw = await generateJobSearchQueries(cv.rawText)
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
  const searchLocations = expandJobSearchLocations(location)
  const expandedLocationSearch = searchLocations.length > 1
  const sourceCount = searchTerms.length * searchLocations.length

  try {
    await updateTask(searchTask.id, { progress: 46, currentStep: 'Searching job sources', sourcesScanned: sourceCount })
    const results = await Promise.allSettled(
      searchTerms.flatMap((term) =>
        searchLocations.map((place) => searchJobTech(term, place, expandedLocationSearch ? 6 : 12))
      )
    )
    foundJobs = uniqueExternalJobs(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
  } catch {
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
  const matchedIds = new Set(existingMatches.map((match) => match.jobListingId))
  const toMatch = jobIds.filter((jobId) => !matchedIds.has(jobId)).slice(0, MAX_AUTO_MATCHES)
  let matchedCount = existingMatches.filter((match) => match.score >= 2.75).length

  await Promise.allSettled(
    toMatch.map(async (jobId) => {
      const jobListing = await prisma.jobListing.findUnique({
        where: { id: jobId },
        include: { company: true },
      })
      if (!jobListing?.description) return

      try {
        const match = await analyzeAndSaveJobMatch(auth.dbUserId, cv, jobListing)
        if (match.score >= 2.75) matchedCount++
      } catch {
        // A failed AI match should still return the saved job as a partial result.
      }
    })
  )

  if (subscription && toMatch.length > 0) {
    await prisma.subscription.update({
      where: { userId: auth.dbUserId },
      data: { aiCallsThisMonth: { increment: toMatch.length } },
    })
  }

  const recommendedMatches = await prisma.jobMatch.findMany({
    where: {
      userId: auth.dbUserId,
      jobListingId: { in: jobIds },
      score: { gte: 2.75 },
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
    searchedFor: searchTerms,
    location: locationLabelForSearch(location),
    searchedLocations: searchLocations.filter(Boolean),
    candidateSummary: searchData.summary,
    source: demoMode ? 'Demo mode' : 'JobTech/Platsbanken',
    sources: demoMode ? ['demo'] : ['jobtech-platsbanken'],
    liaMode: isLIAProfile,
    demoMode,
    usedCvCache,
    taskId: searchTask.id,
    partial: true,
    canRunDeeper: foundJobs.length >= MAX_IMPORTED_JOBS,
    jobIds,
  }

  await updateTask(searchTask.id, {
    status: 'COMPLETED',
    progress: 100,
    currentStep: 'Preparing recommendations',
    matchesFound: matchedCount,
    completedAt: new Date(),
    results: response as Prisma.InputJsonObject,
  })

  return NextResponse.json(response)
}
